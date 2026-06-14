import './env.js'
import { dirname } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { baseSepolia, isSupportedBaseChainId, type BaseChainId, type DuelMetadata, type GenLayerVerdict } from '@wagr/shared'

export interface StoredDuelMetadata extends DuelMetadata {
  chainId: BaseChainId
  duelId: string
  expiryTime: string
  creatorSide: 'YES' | 'NO'
  counterpartySide: 'YES' | 'NO'
  metadataHash: string
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

const metadataByDuel = new Map<string, StoredDuelMetadata>()
const resolutionByDuel = new Map<string, StoredResolution>()
const dataFile = process.env.RELAYER_DATA_FILE || '.wagr-relayer-data.json'

interface RelayerDataFile {
  metadata: StoredDuelMetadata[]
  resolutions: StoredResolution[]
}

function loadFromDisk() {
  if (!existsSync(dataFile)) return

  const parsed = JSON.parse(readFileSync(dataFile, 'utf8')) as Partial<RelayerDataFile>
  for (const item of parsed.metadata || []) {
    const normalized = normalizeMetadata(item)
    metadataByDuel.set(duelKey(normalized.chainId, normalized.duelId), normalized)
  }
  for (const item of parsed.resolutions || []) {
    const normalized = normalizeResolution(item)
    resolutionByDuel.set(duelKey(normalized.chainId, normalized.duelId), normalized)
  }
}

function persistToDisk() {
  const dir = dirname(dataFile)
  if (dir !== '.') {
    mkdirSync(dir, { recursive: true })
  }

  const data: RelayerDataFile = {
    metadata: [...metadataByDuel.values()],
    resolutions: [...resolutionByDuel.values()],
  }
  writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`)
}

loadFromDisk()

export function saveMetadata(metadata: StoredDuelMetadata): StoredDuelMetadata {
  metadataByDuel.set(duelKey(metadata.chainId, metadata.duelId), metadata)
  persistToDisk()
  return metadata
}

export function getMetadata(chainId: BaseChainId, duelId: string): StoredDuelMetadata | undefined {
  return metadataByDuel.get(duelKey(chainId, duelId))
}

export function listMetadata(chainId?: BaseChainId): StoredDuelMetadata[] {
  const items = [...metadataByDuel.values()]
  return chainId ? items.filter((item) => item.chainId === chainId) : items
}

export function saveResolution(resolution: StoredResolution): StoredResolution {
  resolutionByDuel.set(duelKey(resolution.chainId, resolution.duelId), resolution)
  persistToDisk()
  return resolution
}

export function getResolution(chainId: BaseChainId, duelId: string): StoredResolution | undefined {
  return resolutionByDuel.get(duelKey(chainId, duelId))
}

function duelKey(chainId: BaseChainId, duelId: string) {
  return `${chainId}:${duelId}`
}

function normalizeChainId(value: unknown): BaseChainId {
  const chainId = Number(value)
  return isSupportedBaseChainId(chainId) ? chainId : baseSepolia.id
}

function normalizeMetadata(item: StoredDuelMetadata): StoredDuelMetadata {
  return {
    ...item,
    chainId: normalizeChainId(item.chainId),
  }
}

function normalizeResolution(item: StoredResolution): StoredResolution {
  return {
    ...item,
    chainId: normalizeChainId(item.chainId),
  }
}
