import './env.js'
import { dirname } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Pool } from 'pg'
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

type MaybePromise<T> = T | Promise<T>

const metadataByDuel = new Map<string, StoredDuelMetadata>()
const resolutionByDuel = new Map<string, StoredResolution>()
const dataFile = process.env.RELAYER_DATA_FILE || '.wagr-relayer-data.json'
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : undefined

interface RelayerDataFile {
  metadata: StoredDuelMetadata[]
  resolutions: StoredResolution[]
}

let databaseReady: Promise<void> | undefined

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

async function ensureReady() {
  if (!pool) return
  if (!databaseReady) {
    databaseReady = loadFromDatabase()
  }
  await databaseReady
}

async function loadFromDatabase() {
  await pool!.query(`
    CREATE TABLE IF NOT EXISTS relayer_metadata (
      chain_id integer NOT NULL,
      duel_id text NOT NULL,
      payload jsonb NOT NULL,
      PRIMARY KEY (chain_id, duel_id)
    )
  `)
  await pool!.query(`
    CREATE TABLE IF NOT EXISTS relayer_resolutions (
      chain_id integer NOT NULL,
      duel_id text NOT NULL,
      payload jsonb NOT NULL,
      PRIMARY KEY (chain_id, duel_id)
    )
  `)

  const metadataRows = await pool!.query<{ chain_id: number; duel_id: string; payload: StoredDuelMetadata }>(
    'SELECT chain_id, duel_id, payload FROM relayer_metadata',
  )
  metadataByDuel.clear()
  for (const row of metadataRows.rows) {
    const normalized = normalizeMetadata({ ...row.payload, chainId: row.chain_id as BaseChainId, duelId: row.duel_id })
    metadataByDuel.set(duelKey(normalized.chainId, normalized.duelId), normalized)
  }

  const resolutionRows = await pool!.query<{ chain_id: number; duel_id: string; payload: StoredResolution }>(
    'SELECT chain_id, duel_id, payload FROM relayer_resolutions',
  )
  resolutionByDuel.clear()
  for (const row of resolutionRows.rows) {
    const normalized = normalizeResolution({ ...row.payload, chainId: row.chain_id as BaseChainId, duelId: row.duel_id })
    resolutionByDuel.set(duelKey(normalized.chainId, normalized.duelId), normalized)
  }
}

loadFromDisk()

export async function saveMetadata(metadata: StoredDuelMetadata): Promise<StoredDuelMetadata> {
  await ensureReady()
  const normalized = normalizeMetadata(metadata)
  metadataByDuel.set(duelKey(normalized.chainId, normalized.duelId), normalized)

  if (pool) {
    await pool.query(
      `
        INSERT INTO relayer_metadata (chain_id, duel_id, payload)
        VALUES ($1, $2, $3)
        ON CONFLICT (chain_id, duel_id)
        DO UPDATE SET payload = EXCLUDED.payload
      `,
      [normalized.chainId, normalized.duelId, normalized],
    )
  } else {
    persistToDisk()
  }

  return normalized
}

export async function getMetadata(chainId: BaseChainId, duelId: string): Promise<StoredDuelMetadata | undefined> {
  await ensureReady()
  return metadataByDuel.get(duelKey(chainId, duelId))
}

export async function listMetadata(chainId?: BaseChainId): Promise<StoredDuelMetadata[]> {
  await ensureReady()
  const items = [...metadataByDuel.values()]
  return chainId ? items.filter((item) => item.chainId === chainId) : items
}

export async function saveResolution(resolution: StoredResolution): Promise<StoredResolution> {
  await ensureReady()
  const normalized = normalizeResolution(resolution)
  resolutionByDuel.set(duelKey(normalized.chainId, normalized.duelId), normalized)

  if (pool) {
    await pool.query(
      `
        INSERT INTO relayer_resolutions (chain_id, duel_id, payload)
        VALUES ($1, $2, $3)
        ON CONFLICT (chain_id, duel_id)
        DO UPDATE SET payload = EXCLUDED.payload
      `,
      [normalized.chainId, normalized.duelId, normalized],
    )
  } else {
    persistToDisk()
  }

  return normalized
}

export async function getResolution(chainId: BaseChainId, duelId: string): Promise<StoredResolution | undefined> {
  await ensureReady()
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
