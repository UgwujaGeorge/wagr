import {
  authenticatedDuelDataHash,
  baseChainNames,
  baseMainnet,
  baseSepolia,
  canonicalGenLayerDuelId,
  isSupportedBaseChainId,
  WAGR_RESOLUTION_SCOPE,
  type AuthenticatedDuelData,
  type BaseChainId,
  type GenLayerVerdict,
} from '@wagr/shared'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { RelayerConfig } from './config.js'
import { metadataSchema } from './schemas.js'
import type { StoredDuelMetadata, StoredResolution } from './storage.js'

type SubmittedVerdict = Exclude<GenLayerVerdict['verdict'], 'UNRESOLVED'>

export interface RelayerStorage {
  getMetadata(chainId: BaseChainId, duelId: string): Promise<StoredDuelMetadata | undefined> | StoredDuelMetadata | undefined
  getResolution(chainId: BaseChainId, duelId: string): Promise<StoredResolution | undefined> | StoredResolution | undefined
  listMetadata(chainId?: BaseChainId): Promise<StoredDuelMetadata[]> | StoredDuelMetadata[]
  saveMetadata(metadata: StoredDuelMetadata): Promise<StoredDuelMetadata> | StoredDuelMetadata
  saveResolution(resolution: StoredResolution): Promise<StoredResolution> | StoredResolution
}

export interface RelayerAppDeps {
  config: RelayerConfig
  readDuelFromBase(config: RelayerConfig, chainId: BaseChainId, duelId: bigint): Promise<AuthenticatedDuelData>
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
    metadataHash: `0x${string}`,
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

  app.get('/metadata', async (c) => {
    const chainId = parseOptionalChainId(c.req.query('chainId'))
    return c.json({ items: await storage.listMetadata(chainId) })
  })

  app.post('/metadata', async (c) => {
    const body = await c.req.json()
    const parsed = metadataSchema.parse(body)
    if (parsed.creatorSide === parsed.counterpartySide) {
      return c.json({ error: 'counterpartySide must be the opposite side' }, 400)
    }
    return c.json(await storage.saveMetadata(parsed), 201)
  })

  app.get('/metadata/:duelId', async (c) => {
    const chainId = parseRequiredChainId(c.req.query('chainId'))
    const item = await storage.getMetadata(chainId, c.req.param('duelId'))
    if (!item) return c.json({ error: 'metadata not found' }, 404)
    return c.json(item)
  })

  app.get('/resolution/:duelId', async (c) => {
    const chainId = parseRequiredChainId(c.req.query('chainId'))
    const item = await storage.getResolution(chainId, c.req.param('duelId'))
    if (!item) return c.json({ error: 'resolution not found' }, 404)
    return c.json(item)
  })

  app.post('/resolve/:duelId', async (c) => {
    try {
      const duelId = c.req.param('duelId')
      const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
      const chainId = parseRequiredChainId(body.chainId)
      const metadata = await storage.getMetadata(chainId, duelId)
      if (!metadata) return c.json({ error: 'metadata not found' }, 404)
      const numericDuelId = parseBaseDuelId(duelId)
      const baseDuel = await deps.readDuelFromBase(config, chainId, numericDuelId)
      assertBaseDuelMatchesMetadata(chainId, duelId, metadata, baseDuel)

      const genlayerTxHash = parseGenLayerTxHash(body)
      const result = await deps.readResolutionFromGenLayer(config, getGenLayerDuelId(chainId, duelId), genlayerTxHash)
      assertResolutionBinding(result.verdict, metadata, baseDuel)
      const hash = deps.verdictHash(result.verdict)
      const baseVerdict = result.verdict.verdict === 'UNRESOLVED' ? 'INVALID' : result.verdict.verdict
      let baseSubmitted = false
      let baseTxHash: `0x${string}` | undefined
      let baseSubmitError: string | undefined

      if (config.baseNetworks[chainId].escrowAddress && config.relayerPrivateKey) {
        try {
          baseTxHash = await deps.submitVerdictToBase(
            config,
            chainId,
            numericDuelId,
            baseVerdict,
            result.verdict.confidence,
            metadata.metadataHash as `0x${string}`,
            hash,
          )
          baseSubmitted = true
        } catch (error) {
          baseSubmitError = error instanceof Error ? error.message : String(error)
        }
      }

      const stored = await storage.saveResolution({
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
          ? result.verdict.verdict === 'UNRESOLVED'
            ? `GenLayer returned UNRESOLVED${result.verdict.invalid_reason ? `: ${result.verdict.invalid_reason}` : ''}. Submitted as INVALID on Base so both participants can claim refunds.`
            : 'Verdict submitted to Base.'
          : result.verdict.verdict === 'UNRESOLVED'
            ? `GenLayer returned UNRESOLVED${result.verdict.invalid_reason ? `: ${result.verdict.invalid_reason}` : ''}. The duel remains refundable once Base configuration is available.`
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

function parseBaseDuelId(duelId: string): bigint {
  if (!/^[0-9]+$/.test(duelId)) {
    throw new Error('Invalid Base duel ID. Expected an unsigned integer.')
  }
  return BigInt(duelId)
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
  return canonicalGenLayerDuelId(chainId, duelId)
}

function assertBaseDuelMatchesMetadata(
  chainId: BaseChainId,
  duelId: string,
  metadata: StoredDuelMetadata,
  baseDuel: AuthenticatedDuelData,
) {
  if (baseDuel.chainId !== chainId || baseDuel.duelId !== duelId) {
    throw new Error('Stored metadata does not match the requested Base duel ID')
  }
  if (baseDuel.metadataHash.toLowerCase() !== metadata.metadataHash.toLowerCase()) {
    throw new Error('Stored metadata hash does not match the Base duel metadata hash')
  }
  if (baseDuel.creatorSide !== metadata.creatorSide || baseDuel.counterpartySide !== metadata.counterpartySide) {
    throw new Error('Stored duel sides do not match the Base duel')
  }

  const metadataExpiry = Math.floor(new Date(metadata.expiryTime).getTime() / 1000)
  if (!Number.isFinite(metadataExpiry) || baseDuel.expiry !== String(metadataExpiry)) {
    throw new Error('Stored expiry does not match the Base duel expiry')
  }
  if (baseDuel.status !== 'ResolutionRequested') {
    throw new Error('Base duel must be marked resolution requested before GenLayer submission')
  }
}

function assertResolutionBinding(
  verdict: GenLayerVerdict,
  metadata: StoredDuelMetadata,
  baseDuel: AuthenticatedDuelData,
) {
  const expectedDuelId = canonicalGenLayerDuelId(baseDuel.chainId, baseDuel.duelId)
  if (verdict.resolution_scope !== WAGR_RESOLUTION_SCOPE) {
    throw new Error('GenLayer verdict is missing the Wagr Base resolution scope')
  }
  if (verdict.duel_id !== expectedDuelId || verdict.base_duel_id !== baseDuel.duelId || verdict.base_chain_id !== baseDuel.chainId) {
    throw new Error('GenLayer verdict is bound to a different Base duel')
  }
  if (verdict.metadata_hash.toLowerCase() !== metadata.metadataHash.toLowerCase()) {
    throw new Error('GenLayer verdict metadata hash does not match the Base duel')
  }

  const expectedDuelDataHash = authenticatedDuelDataHash(baseDuel)
  if (verdict.authenticated_duel_data_hash.toLowerCase() !== expectedDuelDataHash.toLowerCase()) {
    throw new Error('GenLayer verdict authenticated duel data hash does not match Base')
  }
}
