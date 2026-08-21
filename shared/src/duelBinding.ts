import { encodeAbiParameters, keccak256 } from 'viem'
import type { BaseChainId } from './constants.js'
import type { CommittedDuelMetadata } from './duelMetadata.js'
import type { DuelSide, DuelStatus } from './types.js'

/**
 * Bumped from `v1` when the resolver started recomputing
 * `authenticatedDuelDataHash` itself. A `v1` verdict was adjudicated with an
 * expiry nothing checked, so it must never satisfy a `v2` attester.
 */
export const WAGR_RESOLUTION_SCOPE = 'wagr.base.genlayer.v2'

/** Matches `WagrDuelEscrow.Side`. */
const sideEnum = { YES: 1, NO: 2 } as const

export interface AuthenticatedDuelData {
  chainId: BaseChainId
  escrowAddress: `0x${string}`
  duelId: string
  creator: string
  counterparty: string
  creatorSide: DuelSide
  counterpartySide: DuelSide
  stakeAmountWei: string
  expiry: string
  status: DuelStatus
  metadataHash: `0x${string}`
}

export function canonicalGenLayerDuelId(chainId: BaseChainId, duelId: string): string {
  return `${chainId}:${duelId}`
}

export function canonicalizeAuthenticatedDuelData(data: AuthenticatedDuelData): AuthenticatedDuelData {
  return {
    chainId: data.chainId,
    escrowAddress: data.escrowAddress.toLowerCase() as `0x${string}`,
    duelId: String(data.duelId),
    creator: data.creator.toLowerCase(),
    counterparty: data.counterparty.toLowerCase(),
    creatorSide: data.creatorSide,
    counterpartySide: data.counterpartySide,
    stakeAmountWei: String(data.stakeAmountWei),
    expiry: String(data.expiry),
    status: data.status,
    metadataHash: data.metadataHash.toLowerCase() as `0x${string}`,
  }
}

/**
 * Mirror of `WagrDuelEscrow.duelStateHash(duelId)`.
 *
 * The escrow recomputes this value from its own storage when it verifies an
 * attestation, so an attester can never authorize a verdict against duel state
 * that Base does not actually hold. Status is deliberately excluded: it moves
 * between attestation and submission, and the escrow enforces the required
 * status separately.
 */
export function authenticatedDuelDataHash(data: AuthenticatedDuelData): `0x${string}` {
  const canonical = canonicalizeAuthenticatedDuelData(data)
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'uint256' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint8' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'bytes32' },
      ],
      [
        BigInt(canonical.chainId),
        canonical.escrowAddress,
        BigInt(canonical.duelId),
        canonical.creator as `0x${string}`,
        canonical.counterparty as `0x${string}`,
        sideEnum[canonical.creatorSide],
        BigInt(canonical.stakeAmountWei),
        BigInt(canonical.expiry),
        canonical.metadataHash,
      ],
    ),
  )
}

/**
 * Canonical UTC rendering of a Base expiry, mirrored by `_format_timestamp` in
 * the GenLayer resolver.
 *
 * `toISOString` always emits milliseconds and Python's `isoformat` emits a
 * `+00:00` offset, so neither default is safe to compare across the two. Whole
 * seconds with a `Z` suffix is the one form both produce identically.
 */
export function expiryTimeIso(expirySeconds: string | number | bigint): string {
  const seconds = Number(expirySeconds)
  if (!Number.isFinite(seconds)) {
    throw new Error(`Expiry is not a valid unix timestamp: ${String(expirySeconds)}`)
  }
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * The exact positional arguments for `WagrResolver.resolve_duel`.
 *
 * Kept here rather than at each call site because the resolver recomputes
 * `authenticatedDuelDataHash` from these arguments and rejects the call if the
 * result differs from the hash they carry. Building the tuple from one
 * canonicalized `AuthenticatedDuelData` is what keeps that recomputation from
 * failing on a stray checksum or a number formatted two different ways.
 */
export function genlayerResolveArgs(duel: AuthenticatedDuelData, metadata: CommittedDuelMetadata) {
  const canonical = canonicalizeAuthenticatedDuelData(duel)
  return [
    canonicalGenLayerDuelId(canonical.chainId, canonical.duelId),
    canonical.chainId,
    canonical.duelId,
    canonical.escrowAddress,
    canonical.creator,
    canonical.counterparty,
    canonical.creatorSide,
    canonical.stakeAmountWei,
    canonical.expiry,
    canonical.metadataHash,
    authenticatedDuelDataHash(canonical),
    metadata.claim,
    metadata.resolutionRules,
    metadata.evidenceUrls,
    metadata.allowedSourceTypes,
    metadata.allowedDomains,
    metadata.category,
  ] as const
}
