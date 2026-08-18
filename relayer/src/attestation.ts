import {
  authenticatedDuelDataHash,
  canonicalGenLayerDuelId,
  duelMetadataHash,
  evidencePolicyError,
  verdictAttestationTypedData,
  WAGR_RESOLUTION_SCOPE,
  type AttestableVerdict,
  type AuthenticatedDuelData,
  type BaseChainId,
  type GenLayerVerdict,
} from '@wagr/shared'
import { privateKeyToAccount } from 'viem/accounts'
import type { RelayerConfig } from './config.js'
import type { StoredDuelMetadata } from './storage.js'

export interface AttestationRequest {
  chainId: BaseChainId
  duelId: string
  metadata: StoredDuelMetadata
  genlayerTxHash: `0x${string}`
}

export interface SignedAttestation {
  signer: `0x${string}`
  signature: `0x${string}`
  verdict: AttestableVerdict
  confidenceBps: number
  metadataHash: `0x${string}`
  verdictHash: `0x${string}`
  genlayerTxHash: `0x${string}`
}

export interface AttestationDeps {
  readDuelFromBase(config: RelayerConfig, chainId: BaseChainId, duelId: bigint): Promise<AuthenticatedDuelData>
  readResolutionFromGenLayer(
    config: RelayerConfig,
    duelId: string,
    genlayerTxHash?: `0x${string}`,
  ): Promise<{ verdict: GenLayerVerdict; genlayerTxHash?: `0x${string}` }>
  verdictHash(verdict: unknown): `0x${string}`
}

/** GenLayer statuses a duel may legitimately be attested from. */
const ATTESTABLE_BASE_STATUSES = new Set(['ResolutionRequested', 'Challenged'])

/**
 * Independently re-derives everything an attester signs.
 *
 * Nothing here is taken on the caller's word. The metadata is checked against
 * its own commitment and against the commitment Base holds, the Base duel is
 * read live, the GenLayer verdict is read from the resolver, and every binding
 * field is compared before a signature is produced.
 */
export async function verifyAndSignAttestation(
  config: RelayerConfig,
  deps: AttestationDeps,
  request: AttestationRequest,
): Promise<SignedAttestation> {
  if (!config.attesterPrivateKey) {
    throw new Error('WAGR_ATTESTER_PRIVATE_KEY is required to attest a verdict')
  }
  const escrowAddress = config.baseNetworks[request.chainId].escrowAddress
  if (!escrowAddress) {
    throw new Error(`${config.baseNetworks[request.chainId].name} escrow address is not configured`)
  }

  const metadata = request.metadata
  if (metadata.chainId !== request.chainId || String(metadata.duelId) !== String(request.duelId)) {
    throw new Error('Metadata does not describe the requested duel')
  }

  // 1. The metadata must be the preimage of its own committed hash.
  const recomputed = duelMetadataHash(toCommittedMetadata(metadata))
  if (recomputed.toLowerCase() !== metadata.metadataHash.toLowerCase()) {
    throw new Error('Metadata content does not match its committed metadata hash')
  }

  const policyError = evidencePolicyError(toCommittedMetadata(metadata))
  if (policyError) {
    throw new Error(`Committed evidence policy is not satisfiable: ${policyError}`)
  }

  // 2. That commitment must be the one Base actually holds for this duel.
  const baseDuel = await deps.readDuelFromBase(config, request.chainId, BigInt(request.duelId))
  if (baseDuel.metadataHash.toLowerCase() !== recomputed.toLowerCase()) {
    throw new Error('Committed metadata hash does not match the Base duel metadata hash')
  }
  if (!ATTESTABLE_BASE_STATUSES.has(baseDuel.status)) {
    throw new Error(`Base duel status ${baseDuel.status} is not attestable`)
  }
  const metadataExpiry = Math.floor(new Date(metadata.expiryTime).getTime() / 1000)
  if (!Number.isFinite(metadataExpiry) || baseDuel.expiry !== String(metadataExpiry)) {
    throw new Error('Stored expiry does not match the Base duel expiry')
  }
  if (baseDuel.creatorSide !== metadata.creatorSide || baseDuel.counterpartySide !== metadata.counterpartySide) {
    throw new Error('Stored duel sides do not match the Base duel')
  }

  // 3. The GenLayer verdict must be finalized and bound to this exact duel.
  const { verdict } = await deps.readResolutionFromGenLayer(
    config,
    canonicalGenLayerDuelId(request.chainId, request.duelId),
    request.genlayerTxHash,
  )
  assertVerdictBinding(verdict, baseDuel, recomputed)

  const verdictHash = deps.verdictHash(verdict)
  const baseVerdict: AttestableVerdict = verdict.verdict === 'UNRESOLVED' ? 'INVALID' : verdict.verdict
  const confidenceBps = toConfidenceBps(verdict.confidence)

  const account = privateKeyToAccount(config.attesterPrivateKey)
  const signature = await account.signTypedData(
    verdictAttestationTypedData(request.chainId, escrowAddress, {
      duelId: BigInt(request.duelId),
      verdict: baseVerdict,
      confidenceBps,
      metadataHash: recomputed,
      authenticatedDuelDataHash: authenticatedDuelDataHash(baseDuel),
      verdictHash,
      genlayerTxHash: request.genlayerTxHash,
    }),
  )

  return {
    signer: account.address,
    signature,
    verdict: baseVerdict,
    confidenceBps,
    metadataHash: recomputed,
    verdictHash,
    genlayerTxHash: request.genlayerTxHash,
  }
}

export function toCommittedMetadata(metadata: StoredDuelMetadata) {
  return {
    claim: metadata.claim,
    resolutionRules: metadata.resolutionRules,
    evidenceUrls: metadata.evidenceUrls,
    allowedSourceTypes: metadata.allowedSourceTypes,
    allowedDomains: metadata.allowedDomains,
    category: metadata.category || '',
  }
}

export function toConfidenceBps(confidence: number): number {
  return Math.max(0, Math.min(10_000, Math.round(confidence * 100)))
}

export function assertVerdictBinding(
  verdict: GenLayerVerdict,
  baseDuel: AuthenticatedDuelData,
  metadataHash: `0x${string}`,
) {
  const expectedDuelId = canonicalGenLayerDuelId(baseDuel.chainId, baseDuel.duelId)
  if (verdict.resolution_scope !== WAGR_RESOLUTION_SCOPE) {
    throw new Error('GenLayer verdict is missing the Wagr Base resolution scope')
  }
  if (
    verdict.duel_id !== expectedDuelId ||
    verdict.base_duel_id !== baseDuel.duelId ||
    verdict.base_chain_id !== baseDuel.chainId
  ) {
    throw new Error('GenLayer verdict is bound to a different Base duel')
  }
  if (verdict.metadata_hash.toLowerCase() !== metadataHash.toLowerCase()) {
    throw new Error('GenLayer verdict metadata hash does not match the Base duel')
  }
  const expectedDuelDataHash = authenticatedDuelDataHash(baseDuel)
  if (verdict.authenticated_duel_data_hash.toLowerCase() !== expectedDuelDataHash.toLowerCase()) {
    throw new Error('GenLayer verdict authenticated duel data hash does not match Base')
  }
}
