import {
  baseChainNames,
  baseMainnet,
  baseSepolia,
  canonicalGenLayerDuelId,
  duelMetadataHash,
  evidencePolicyError,
  isSupportedBaseChainId,
  type AuthenticatedDuelData,
  type BaseChainId,
  type GenLayerVerdict,
} from '@wagr/shared'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { toCommittedMetadata, verifyAndSignAttestation, type SignedAttestation } from './attestation.js'
import type { RelayerConfig } from './config.js'
import { assembleQuorum, fetchRemoteAttestation } from './quorum.js'
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
  readAttesterThreshold(config: RelayerConfig, chainId: BaseChainId): Promise<number>
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
    confidenceBps: number,
    metadataHash: `0x${string}`,
    verdictHash: `0x${string}`,
    genlayerTxHash: `0x${string}`,
    signatures: `0x${string}`[],
  ): Promise<`0x${string}`>
  verdictHash(verdict: unknown): `0x${string}`
  fetchImpl?: typeof fetch
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
      attesterConfigured: Boolean(config.attesterPrivateKey),
      remoteAttesters: config.attesterEndpoints.length,
      requiresGenlayerFinality: config.requireGenlayerFinality,
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

  /**
   * Metadata is only ever stored when it is the verified preimage of the hash
   * the duel already committed onchain, and it can never be replaced with
   * different content afterwards.
   */
  app.post('/metadata', async (c) => {
    const body = await c.req.json()
    const parsed = metadataSchema.parse(body)
    if (parsed.creatorSide === parsed.counterpartySide) {
      return c.json({ error: 'counterpartySide must be the opposite side' }, 400)
    }

    const committed = toCommittedMetadata(parsed as StoredDuelMetadata)
    const recomputed = duelMetadataHash(committed)
    if (recomputed.toLowerCase() !== parsed.metadataHash.toLowerCase()) {
      return c.json({ error: 'metadata content does not match its metadataHash commitment' }, 400)
    }

    const policyError = evidencePolicyError(committed)
    if (policyError) {
      return c.json({ error: `evidence policy is not satisfiable: ${policyError}` }, 400)
    }

    // The commitment must be the one Base holds, so metadata can never be
    // stored for a duel that never agreed to it.
    if (config.baseNetworks[parsed.chainId].escrowAddress) {
      const baseDuel = await deps.readDuelFromBase(config, parsed.chainId, parseBaseDuelId(parsed.duelId))
      if (baseDuel.metadataHash.toLowerCase() !== recomputed.toLowerCase()) {
        return c.json({ error: 'metadataHash does not match the Base duel commitment' }, 400)
      }
    }

    const existing = await storage.getMetadata(parsed.chainId, parsed.duelId)
    if (existing && existing.metadataHash.toLowerCase() !== recomputed.toLowerCase()) {
      return c.json({ error: 'metadata for this duel is already committed and cannot be replaced' }, 409)
    }

    return c.json(await storage.saveMetadata(parsed as StoredDuelMetadata), 201)
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

  /**
   * Attester endpoint. Verifies the duel independently and returns one EIP-712
   * signature. Deployed separately, under a different key and host, this is how
   * a quorum stops being a single point of trust.
   */
  app.post('/attest', async (c) => {
    if (!config.attesterPrivateKey) {
      return c.json({ error: 'this relayer is not configured as an attester' }, 501)
    }
    if (config.attesterAuthToken) {
      const header = c.req.header('authorization') || ''
      if (header !== `Bearer ${config.attesterAuthToken}`) {
        return c.json({ error: 'unauthorized' }, 401)
      }
    }

    const body = await c.req.json()
    const chainId = parseRequiredChainId(body.chainId)
    const duelId = String(body.duelId ?? '')
    parseBaseDuelId(duelId)
    const metadata = metadataSchema.parse(body.metadata) as StoredDuelMetadata
    const genlayerTxHash = requireGenLayerTxHash(body.genlayerTxHash)

    const attestation = await verifyAndSignAttestation(config, deps, {
      chainId,
      duelId,
      metadata,
      genlayerTxHash,
    })
    return c.json(attestation)
  })

  app.post('/resolve/:duelId', async (c) => {
    try {
      const duelId = c.req.param('duelId')
      const body = await c.req.json().catch(() => ({}) as Record<string, unknown>)
      const chainId = parseRequiredChainId(body.chainId)
      const metadata = await storage.getMetadata(chainId, duelId)
      if (!metadata) return c.json({ error: 'metadata not found' }, 404)

      const genlayerTxHash = requireGenLayerTxHash(body.genlayerTxHash)
      const numericDuelId = parseBaseDuelId(duelId)

      // Re-verify the commitment on every resolution, so tampering with the
      // store after creation still cannot reach GenLayer or Base.
      const committed = toCommittedMetadata(metadata)
      const recomputed = duelMetadataHash(committed)
      if (recomputed.toLowerCase() !== metadata.metadataHash.toLowerCase()) {
        return c.json({ error: 'stored metadata no longer matches its commitment' }, 409)
      }

      const baseDuel = await deps.readDuelFromBase(config, chainId, numericDuelId)
      assertBaseDuelMatchesMetadata(chainId, duelId, metadata, baseDuel, recomputed)

      const { attestations, failures } = await collectAttestations(deps, {
        chainId,
        duelId,
        metadata,
        genlayerTxHash,
      })
      const quorum = assembleQuorum(attestations, failures)

      const required = await deps.readAttesterThreshold(config, chainId)
      if (quorum.signatures.length < required) {
        return c.json(
          {
            error: `only ${quorum.signatures.length} of the required ${required} attestations were collected`,
            attesterFailures: quorum.failures,
          },
          409,
        )
      }

      // The stored verdict is read back for display; the quorum decides what
      // Base is told.
      const { verdict } = await deps.readResolutionFromGenLayer(
        config,
        canonicalGenLayerDuelId(chainId, duelId),
        genlayerTxHash,
      )

      let baseSubmitted = false
      let baseTxHash: `0x${string}` | undefined
      let baseSubmitError: string | undefined

      if (config.baseNetworks[chainId].escrowAddress && config.relayerPrivateKey) {
        try {
          baseTxHash = await deps.submitVerdictToBase(
            config,
            chainId,
            numericDuelId,
            quorum.verdict,
            quorum.confidenceBps,
            quorum.metadataHash,
            quorum.verdictHash,
            quorum.genlayerTxHash,
            quorum.signatures,
          )
          baseSubmitted = true
        } catch (error) {
          baseSubmitError = error instanceof Error ? error.message : String(error)
        }
      }

      const stored = await storage.saveResolution({
        chainId,
        duelId,
        verdict,
        verdictHash: quorum.verdictHash,
        genlayerTxHash,
        attesters: quorum.signers,
        baseSubmitted,
        baseTxHash,
        createdAt: new Date().toISOString(),
        mock: false,
      })

      return c.json({
        ...stored,
        baseSubmitError,
        attesterFailures: quorum.failures,
        nextStep: describeNextStep(baseSubmitted, verdict, quorum.signers.length, required),
      })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
    }
  })

  return app
}

async function collectAttestations(
  deps: RelayerAppDeps,
  request: { chainId: BaseChainId; duelId: string; metadata: StoredDuelMetadata; genlayerTxHash: `0x${string}` },
): Promise<{ attestations: SignedAttestation[]; failures: string[] }> {
  const { config } = deps
  const attestations: SignedAttestation[] = []
  const failures: string[] = []

  if (config.attesterPrivateKey) {
    try {
      attestations.push(await verifyAndSignAttestation(config, deps, request))
    } catch (error) {
      failures.push(`local attester: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const remote = await Promise.allSettled(
    config.attesterEndpoints.map((endpoint) =>
      fetchRemoteAttestation(
        {
          endpoint,
          chainId: request.chainId,
          duelId: request.duelId,
          metadata: request.metadata,
          genlayerTxHash: request.genlayerTxHash,
          authToken: config.attesterAuthToken,
        },
        deps.fetchImpl,
      ),
    ),
  )

  remote.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      attestations.push(result.value)
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason)
      failures.push(`${config.attesterEndpoints[index]}: ${reason}`)
    }
  })

  return { attestations, failures }
}

function describeNextStep(
  baseSubmitted: boolean,
  verdict: GenLayerVerdict,
  signerCount: number,
  required: number,
): string {
  const quorumNote = `${signerCount} of ${required} required attestations`
  if (!baseSubmitted) {
    return `Verdict verified with ${quorumNote} but not submitted. Configure the Base escrow address and relayer key.`
  }
  if (verdict.verdict === 'UNRESOLVED') {
    return `GenLayer returned UNRESOLVED${verdict.invalid_reason ? `: ${verdict.invalid_reason}` : ''}. Submitted as INVALID with ${quorumNote} so both participants can claim refunds. The verdict is claimable once the challenge window closes.`
  }
  return `Verdict submitted to Base with ${quorumNote}. It becomes claimable once the challenge window closes.`
}

function requireGenLayerTxHash(value: unknown): `0x${string}` {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('A GenLayer transaction hash is required. Expected a 32-byte 0x-prefixed hash.')
  }
  return value.toLowerCase() as `0x${string}`
}

function parseBaseDuelId(duelId: string): bigint {
  if (!/^[0-9]+$/.test(duelId)) {
    throw new Error('Invalid Base duel ID. Expected an unsigned integer.')
  }
  return BigInt(duelId)
}

function parseRequiredChainId(value: unknown): BaseChainId {
  if (value == null || value === '') {
    throw new Error(
      `chainId is required. Supported chains are ${baseSepolia.id} (${baseChainNames[baseSepolia.id]}) and ${baseMainnet.id} (${baseChainNames[baseMainnet.id]}).`,
    )
  }
  return parseChainId(value)
}

function parseChainId(value: unknown): BaseChainId {
  const chainId = Number(value)
  if (!isSupportedBaseChainId(chainId)) {
    throw new Error(
      `Unsupported Base chain ID. Supported chains are ${baseSepolia.id} (${baseChainNames[baseSepolia.id]}) and ${baseMainnet.id} (${baseChainNames[baseMainnet.id]}).`,
    )
  }
  return chainId
}

function parseOptionalChainId(value: unknown): BaseChainId | undefined {
  if (value == null || value === '') return undefined
  return parseChainId(value)
}

function assertBaseDuelMatchesMetadata(
  chainId: BaseChainId,
  duelId: string,
  metadata: StoredDuelMetadata,
  baseDuel: AuthenticatedDuelData,
  recomputedMetadataHash: `0x${string}`,
) {
  if (baseDuel.chainId !== chainId || baseDuel.duelId !== duelId) {
    throw new Error('Stored metadata does not match the requested Base duel ID')
  }
  if (baseDuel.metadataHash.toLowerCase() !== recomputedMetadataHash.toLowerCase()) {
    throw new Error('Stored metadata hash does not match the Base duel metadata hash')
  }
  if (baseDuel.creatorSide !== metadata.creatorSide || baseDuel.counterpartySide !== metadata.counterpartySide) {
    throw new Error('Stored duel sides do not match the Base duel')
  }

  const metadataExpiry = Math.floor(new Date(metadata.expiryTime).getTime() / 1000)
  if (!Number.isFinite(metadataExpiry) || baseDuel.expiry !== String(metadataExpiry)) {
    throw new Error('Stored expiry does not match the Base duel expiry')
  }
  if (baseDuel.status !== 'ResolutionRequested' && baseDuel.status !== 'Challenged') {
    throw new Error('Base duel must be marked resolution requested before GenLayer submission')
  }
}
