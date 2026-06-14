import type { BaseChainId, DuelMetadata, DuelSide, GenLayerVerdict } from '@wagr/shared'
import type { GenLayerConfig } from './genlayer'
import { relayerUrl } from './contracts'

export interface StoredDuelMetadata extends DuelMetadata {
  chainId: BaseChainId
  duelId: string
  expiryTime: string
  creatorSide: DuelSide
  counterpartySide: DuelSide
  metadataHash: `0x${string}`
}

export interface StoredResolution {
  chainId: BaseChainId
  duelId: string
  verdict: GenLayerVerdict
  verdictHash: `0x${string}`
  genlayerTxHash?: `0x${string}`
  baseSubmitted: boolean
  baseTxHash?: `0x${string}`
  createdAt: string
  mock: boolean
}

async function relayerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${relayerUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Relayer request failed with HTTP ${response.status}`)
  }
  return data as T
}

export function listDuelMetadata(chainId: BaseChainId): Promise<{ items: StoredDuelMetadata[] }> {
  return relayerRequest(`/metadata?chainId=${chainId}`)
}

export function getDuelMetadata(chainId: BaseChainId, duelId: string): Promise<StoredDuelMetadata> {
  return relayerRequest(`/metadata/${duelId}?chainId=${chainId}`)
}

export function saveDuelMetadata(metadata: StoredDuelMetadata): Promise<StoredDuelMetadata> {
  return relayerRequest('/metadata', {
    method: 'POST',
    body: JSON.stringify(metadata),
  })
}

export function getResolution(chainId: BaseChainId, duelId: string): Promise<StoredResolution> {
  return relayerRequest(`/resolution/${duelId}?chainId=${chainId}`)
}

export function getRelayerConfig(): Promise<GenLayerConfig> {
  return relayerRequest('/config')
}

export function submitGenLayerResolution(
  chainId: BaseChainId,
  duelId: string,
  genlayerTxHash: `0x${string}`,
): Promise<StoredResolution & { baseSubmitError?: string; nextStep: string }> {
  return relayerRequest(`/resolve/${duelId}`, {
    method: 'POST',
    body: JSON.stringify({ chainId, genlayerTxHash }),
  })
}
