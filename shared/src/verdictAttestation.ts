import { hashTypedData } from 'viem'
import type { BaseChainId } from './constants.js'

export const WAGR_ATTESTATION_DOMAIN_NAME = 'Wagr'
export const WAGR_ATTESTATION_DOMAIN_VERSION = '1'

/** Matches `WagrDuelEscrow.Verdict`. `None` is never attestable. */
export const attestableVerdictEnum = {
  YES: 1,
  NO: 2,
  INVALID: 3,
} as const

export type AttestableVerdict = keyof typeof attestableVerdictEnum

export const verdictAttestationTypes = {
  Verdict: [
    { name: 'duelId', type: 'uint256' },
    { name: 'verdict', type: 'uint8' },
    { name: 'confidenceBps', type: 'uint16' },
    { name: 'metadataHash', type: 'bytes32' },
    { name: 'authenticatedDuelDataHash', type: 'bytes32' },
    { name: 'verdictHash', type: 'bytes32' },
    { name: 'genlayerTxHash', type: 'bytes32' },
  ],
} as const

export interface VerdictAttestation {
  duelId: bigint
  verdict: AttestableVerdict
  confidenceBps: number
  metadataHash: `0x${string}`
  authenticatedDuelDataHash: `0x${string}`
  verdictHash: `0x${string}`
  genlayerTxHash: `0x${string}`
}

export function verdictAttestationDomain(chainId: BaseChainId, escrowAddress: `0x${string}`) {
  return {
    name: WAGR_ATTESTATION_DOMAIN_NAME,
    version: WAGR_ATTESTATION_DOMAIN_VERSION,
    chainId,
    verifyingContract: escrowAddress,
  } as const
}

export function verdictAttestationMessage(attestation: VerdictAttestation) {
  return {
    duelId: attestation.duelId,
    verdict: attestableVerdictEnum[attestation.verdict],
    confidenceBps: attestation.confidenceBps,
    metadataHash: attestation.metadataHash,
    authenticatedDuelDataHash: attestation.authenticatedDuelDataHash,
    verdictHash: attestation.verdictHash,
    genlayerTxHash: attestation.genlayerTxHash,
  } as const
}

export function verdictAttestationTypedData(
  chainId: BaseChainId,
  escrowAddress: `0x${string}`,
  attestation: VerdictAttestation,
) {
  return {
    domain: verdictAttestationDomain(chainId, escrowAddress),
    types: verdictAttestationTypes,
    primaryType: 'Verdict',
    message: verdictAttestationMessage(attestation),
  } as const
}

/**
 * The EIP-712 digest each attester signs. The domain binds the Base chain ID
 * and the escrow address, so a Sepolia attestation cannot be replayed on
 * mainnet and an attestation for one escrow cannot be replayed against a
 * redeployed one.
 */
export function verdictAttestationDigest(
  chainId: BaseChainId,
  escrowAddress: `0x${string}`,
  attestation: VerdictAttestation,
): `0x${string}` {
  return hashTypedData(verdictAttestationTypedData(chainId, escrowAddress, attestation))
}

/** Signatures must be sorted by recovered signer so the escrow can reject duplicates cheaply. */
export function sortSignaturesBySigner(
  entries: Array<{ signer: `0x${string}`; signature: `0x${string}` }>,
): `0x${string}`[] {
  return [...entries]
    .sort((left, right) => (left.signer.toLowerCase() < right.signer.toLowerCase() ? -1 : 1))
    .map((entry) => entry.signature)
}
