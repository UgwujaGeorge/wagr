import { sortSignaturesBySigner, type BaseChainId } from '@wagr/shared'
import type { SignedAttestation } from './attestation.js'

export interface QuorumResult {
  signatures: `0x${string}`[]
  signers: `0x${string}`[]
  verdict: SignedAttestation['verdict']
  confidenceBps: number
  metadataHash: `0x${string}`
  verdictHash: `0x${string}`
  genlayerTxHash: `0x${string}`
  failures: string[]
}

export interface RemoteAttestationRequest {
  endpoint: string
  chainId: BaseChainId
  duelId: string
  metadata: unknown
  genlayerTxHash: `0x${string}`
  authToken?: string
}

export async function fetchRemoteAttestation(
  request: RemoteAttestationRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<SignedAttestation> {
  const response = await fetchImpl(`${request.endpoint.replace(/\/$/, '')}/attest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(request.authToken ? { authorization: `Bearer ${request.authToken}` } : {}),
    },
    body: JSON.stringify({
      chainId: request.chainId,
      duelId: request.duelId,
      metadata: request.metadata,
      genlayerTxHash: request.genlayerTxHash,
    }),
  })

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(String(data.error || `attester responded with HTTP ${response.status}`))
  }
  if (typeof data.signature !== 'string' || typeof data.signer !== 'string') {
    throw new Error('attester returned a malformed attestation')
  }
  return data as unknown as SignedAttestation
}

/**
 * Combines independently produced attestations into one quorum.
 *
 * Attesters must agree exactly. They all read the same finalized GenLayer
 * verdict and the same Base state, so any disagreement means at least one of
 * them saw something different and the verdict must not be submitted.
 */
export function assembleQuorum(attestations: SignedAttestation[], failures: string[]): QuorumResult {
  if (attestations.length === 0) {
    throw new Error(
      `No attester signed this verdict${failures.length ? `: ${failures.join('; ')}` : ''}`,
    )
  }

  const [first, ...rest] = attestations
  for (const attestation of rest) {
    if (
      attestation.verdict !== first.verdict ||
      attestation.confidenceBps !== first.confidenceBps ||
      attestation.metadataHash.toLowerCase() !== first.metadataHash.toLowerCase() ||
      attestation.verdictHash.toLowerCase() !== first.verdictHash.toLowerCase() ||
      attestation.genlayerTxHash.toLowerCase() !== first.genlayerTxHash.toLowerCase()
    ) {
      throw new Error('Attesters disagreed about the verdict; refusing to submit to Base')
    }
  }

  const seen = new Set<string>()
  const unique = attestations.filter((attestation) => {
    const key = attestation.signer.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    signatures: sortSignaturesBySigner(
      unique.map((attestation) => ({ signer: attestation.signer, signature: attestation.signature })),
    ),
    signers: unique.map((attestation) => attestation.signer),
    verdict: first.verdict,
    confidenceBps: first.confidenceBps,
    metadataHash: first.metadataHash,
    verdictHash: first.verdictHash,
    genlayerTxHash: first.genlayerTxHash,
    failures,
  }
}
