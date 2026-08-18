import { encodeAbiParameters, keccak256 } from 'viem'
import type { BaseChainId } from './constants.js'
import type { DuelSide, DuelStatus } from './types.js'

export const WAGR_RESOLUTION_SCOPE = 'wagr.base.genlayer.v1'

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
