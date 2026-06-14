import { baseChainNames, baseMainnet, baseSepolia, isSupportedBaseChainId, type BaseChainId, type GenLayerVerdict } from '@wagr/shared'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { RelayerConfig } from './config.js'
import { metadataSchema } from './schemas.js'
import type { StoredDuelMetadata, StoredResolution } from './storage.js'

type SubmittedVerdict = Exclude<GenLayerVerdict['verdict'], 'UNRESOLVED'>

export interface RelayerStorage {
  getMetadata(chainId: BaseChainId, duelId: string): StoredDuelMetadata | undefined
  getResolution(chainId: BaseChainId, duelId: string): StoredResolution | undefined
  listMetadata(chainId?: BaseChainId): StoredDuelMetadata[]
  saveMetadata(metadata: StoredDuelMetadata): StoredDuelMetadata
  saveResolution(resolution: StoredResolution): StoredResolution
}

export interface RelayerAppDeps {
  config: RelayerConfig
  readResolutionFromGenLayer(
    config: RelayerConfig,
    duelId: string,
    genlayerTxHash?: `0x${string}`,
  ): Promise<{ verdict: GenLayerVerdict; genlayerTxHash?: `0x${string}` }>
  storage: RelayerStorage
  submitVerdictToBase(
    config: RelayerConfig,
    chainId: BaseChainId,
    duelId: bigint,
    verdict: SubmittedVerdict,
    confidence: number,
    hash: `0x${string}`,
  ): Promise<`0x${string}`>
  verdictHash(verdict: unknown): `0x${string}`
}

export function createRelayerApp(deps: RelayerAppDeps) {
  const app = new Hono()
  const { config, storage } = deps

  app.use('*', cors())
  app.onError((error, c) => c.json({ error: error instanceof Error ? error.message : String(error) }, 400))

  app.get('/health', (c) =>
    c.json({
      ok: true,
      supportedBaseChains: [baseSepolia.id, baseMainnet.id],
      baseEscrowConfigured: {
        [baseSepolia.id]: Boolean(config.baseNetworks[baseSepolia.id].escrowAddress),
        [baseMainnet.id]: Boolean(config.baseNetworks[baseMainnet.id].escrowAddress),
      },
      genlayerResolverConfigured: Boolean(config.genlayerResolverAddress),
    }),
  )

  app.get('/config', (c) =>
    c.json({
      genlayerChainId: 61999,
      genlayerRpcUrl: config.genlayerRpcUrl,
      genlayerExplorerUrl: config.genlayerExplorerUrl,
      genlayerResolverAddress: config.genlayerResolverAddress,
      baseNetworks: config.baseNetworks,
    }),
  )

  app.get('/metadata', (c) => {
    const chainId = parseOptionalChainId(c.req.query('chainId'))
    return c.json({ items: storage.listMetadata(chainId) })
  })

  app.post('/metadata', async (c) => {
    const body = await c.req.json()
    const parsed = metadataSchema.parse(body)
    if (parsed.creatorSide === parsed.counterpartySide) {
      return c.json({ error: 'counterpartySide must be the opposite side' }, 400)
    }
    return c.json(storage.saveMetadata(parsed), 201)
  })

  app.get('/metadata/:duelId', (c) => {
    const chainId = parseRequiredChainId(c.req.query('chainId'))
    const item = storage.getMetadata(chainId, c.req.param('duelId'))
    if (!item) return c.json({ error: 'metadata not found' }, 404)
    return c.json(item)
  })

  app.get('/resolution/:duelId', (c) => {
    const chainId = parseRequiredChainId(c.req.query('chainId'))
    const item = storage.getResolution(chainId, c.req.param('duelId'))
    if (!item) return c.json({ error: 'resolution not found' }, 404)
    return c.json(item)
  })

  app.post('/resolve/:duelId', async (c) => {
    try {
      const duelId = c.req.param('duelId')
      const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
      const chainId = parseRequiredChainId(body.chainId)
      const metadata = storage.getMetadata(chainId, duelId)
      if (!metadata) return c.json({ error: 'metadata not found' }, 404)

      const genlayerTxHash = parseGenLayerTxHash(body)
      const result = await deps.readResolutionFromGenLayer(config, getGenLayerDuelId(chainId, duelId), genlayerTxHash)
      const hash = deps.verdictHash(result.verdict)
      let baseSubmitted = false
      let baseTxHash: `0x${string}` | undefined
      let baseSubmitError: string | undefined

      if (result.verdict.verdict === 'UNRESOLVED') {
        baseSubmitError = 'GenLayer returned UNRESOLVED, so no Base verdict was submitted.'
      } else if (config.baseNetworks[chainId].escrowAddress && config.relayerPrivateKey) {
        try {
          baseTxHash = await deps.submitVerdictToBase(
            config,
            chainId,
            BigInt(duelId),
            result.verdict.verdict,
            result.verdict.confidence,
            hash,
          )
          baseSubmitted = true
        } catch (error) {
          baseSubmitError = error instanceof Error ? error.message : String(error)
        }
      }

      const stored = storage.saveResolution({
        chainId,
        duelId,
        verdict: result.verdict,
        verdictHash: hash,
        genlayerTxHash: result.genlayerTxHash,
        baseSubmitted,
        baseTxHash,
        createdAt: new Date().toISOString(),
        mock: false,
      })

      return c.json({
        ...stored,
        genlayerTxHash: result.genlayerTxHash,
        baseSubmitError,
        nextStep: baseSubmitted
          ? 'Verdict submitted to Base.'
          : result.verdict.verdict === 'UNRESOLVED'
            ? 'GenLayer returned UNRESOLVED. No Base verdict was submitted, so this duel can be retried after the evidence is clear.'
            : 'Verdict stored locally. Configure Base escrow address and relayer private key to submit onchain.',
      })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
    }
  })

  return app
}

function parseGenLayerTxHash(body: Record<string, unknown>): `0x${string}` | undefined {
  if (!Object.hasOwn(body, 'genlayerTxHash') || body.genlayerTxHash == null || body.genlayerTxHash === '') {
    return undefined
  }
  if (typeof body.genlayerTxHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(body.genlayerTxHash)) {
    throw new Error('Invalid GenLayer transaction hash. Expected a 32-byte 0x-prefixed transaction hash.')
  }
  return body.genlayerTxHash as `0x${string}`
}

function parseRequiredChainId(value: unknown): BaseChainId {
  if (value == null || value === '') {
    throw new Error(`chainId is required. Supported chains are ${baseSepolia.id} (${baseChainNames[baseSepolia.id]}) and ${baseMainnet.id} (${baseChainNames[baseMainnet.id]}).`)
  }
  return parseChainId(value)
}

function parseChainId(value: unknown): BaseChainId {
  const chainId = Number(value)
  if (!isSupportedBaseChainId(chainId)) {
    throw new Error(`Unsupported Base chain ID. Supported chains are ${baseSepolia.id} (${baseChainNames[baseSepolia.id]}) and ${baseMainnet.id} (${baseChainNames[baseMainnet.id]}).`)
  }
  return chainId
}

function parseOptionalChainId(value: unknown): BaseChainId | undefined {
  if (value == null || value === '') return undefined
  return parseChainId(value)
}

function getGenLayerDuelId(chainId: BaseChainId, duelId: string): string {
  return chainId === baseSepolia.id ? duelId : `${chainId}:${duelId}`
}
