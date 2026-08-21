import type { GenLayerVerdict } from '@wagr/shared'
import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { ExecutionResult, TransactionStatus, type TransactionHash } from 'genlayer-js/types'
import type { RelayerConfig } from './config.js'

export interface GenLayerResolutionResult {
  verdict: GenLayerVerdict
  genlayerTxHash?: `0x${string}`
}

const GENLAYER_RECEIPT_WAIT_INTERVAL_MS = 5_000
const GENLAYER_RECEIPT_WAIT_RETRIES = 84
// Finalization waits out GenLayer's appeal window, which is far longer than
// acceptance. An accepted-but-not-finalized verdict can still be overturned.
const GENLAYER_FINALITY_WAIT_RETRIES = 360

export async function readResolutionFromGenLayer(
  config: RelayerConfig,
  duelId: string,
  authenticatedDuelDataHash: `0x${string}`,
  genlayerTxHash?: `0x${string}`,
): Promise<GenLayerResolutionResult> {
  if (!config.genlayerResolverAddress) {
    throw new Error('GENLAYER_RESOLVER_ADDRESS is required before GenLayer resolutions can be submitted')
  }

  const client = createClient({
    chain: studionet,
    endpoint: config.genlayerRpcUrl,
  })

  if (genlayerTxHash) {
    // A verdict is only authorization once GenLayer itself considers it final.
    // Waiting on ACCEPTED would let an appeal overturn the verdict after Base
    // has already paid out.
    const requireFinality = config.requireGenlayerFinality
    const receipt = await client.waitForTransactionReceipt({
      hash: genlayerTxHash as TransactionHash,
      status: requireFinality ? TransactionStatus.FINALIZED : TransactionStatus.ACCEPTED,
      interval: GENLAYER_RECEIPT_WAIT_INTERVAL_MS,
      retries: requireFinality ? GENLAYER_FINALITY_WAIT_RETRIES : GENLAYER_RECEIPT_WAIT_RETRIES,
    })

    if (getReceiptExecutionResultName(receipt) === ExecutionResult.FINISHED_WITH_ERROR) {
      throw new Error(`GenLayer resolution transaction failed: ${genlayerTxHash}`)
    }
    if (requireFinality && !isFinalizedReceipt(receipt)) {
      throw new Error(
        `GenLayer transaction ${genlayerTxHash} is not FINALIZED yet; refusing to attest an appealable verdict`,
      )
    }
  }

  // The resolver stores one verdict per (duel, exact Base state) pair, so the
  // state being asked about is named in the read itself. A verdict adjudicated
  // against duel data Base does not hold is not reachable from here at all.
  const resolutionJson = await client.readContract({
    address: config.genlayerResolverAddress,
    functionName: 'get_resolution_json',
    args: [duelId, authenticatedDuelDataHash],
  })

  if (typeof resolutionJson !== 'string') {
    throw new Error('GenLayer resolver returned an unexpected response')
  }

  const verdict = parseGenLayerVerdict(resolutionJson)
  if (verdict.verdict === 'UNRESOLVED' && verdict.invalid_reason === 'No resolution stored for duel') {
    throw new Error('GenLayer resolver has not stored a verdict for this duel yet')
  }

  return { verdict, genlayerTxHash }
}

function parseGenLayerVerdict(value: string): GenLayerVerdict {
  const parsed = JSON.parse(value) as Partial<GenLayerVerdict>
  const verdict = parsed.verdict
  if (verdict !== 'YES' && verdict !== 'NO' && verdict !== 'INVALID' && verdict !== 'UNRESOLVED') {
    throw new Error('GenLayer resolver returned an invalid verdict')
  }

  const confidence = Number(parsed.confidence)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    throw new Error('GenLayer resolver returned an invalid confidence score')
  }

  const invalidReason = String(parsed.invalid_reason || '')
  if (verdict === 'UNRESOLVED' && invalidReason === 'No resolution stored for duel') {
    return {
      resolution_scope: '',
      duel_id: '',
      base_chain_id: 0,
      base_duel_id: '',
      metadata_hash: '',
      authenticated_duel_data_hash: '',
      expiry_time: '',
      verdict,
      confidence,
      evidence_summary: String(parsed.evidence_summary || ''),
      sources_checked: Array.isArray(parsed.sources_checked) ? parsed.sources_checked : [],
      reasoning: String(parsed.reasoning || ''),
      resolved_at: String(parsed.resolved_at || ''),
      invalid_reason: invalidReason,
    }
  }

  return {
    resolution_scope: requireString(parsed.resolution_scope, 'resolution scope'),
    duel_id: requireString(parsed.duel_id, 'duel ID'),
    base_chain_id: requireInteger(parsed.base_chain_id, 'Base chain ID'),
    base_duel_id: requireString(parsed.base_duel_id, 'Base duel ID'),
    metadata_hash: requireBytes32(parsed.metadata_hash, 'metadata hash'),
    authenticated_duel_data_hash: requireBytes32(parsed.authenticated_duel_data_hash, 'authenticated duel data hash'),
    expiry_time: requireString(parsed.expiry_time, 'expiry time'),
    verdict,
    confidence,
    evidence_summary: String(parsed.evidence_summary || ''),
    sources_checked: Array.isArray(parsed.sources_checked) ? parsed.sources_checked : [],
    reasoning: String(parsed.reasoning || ''),
    resolved_at: String(parsed.resolved_at || ''),
    invalid_reason: invalidReason,
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`GenLayer resolver returned an invalid ${label}`)
  }
  return value
}

function requireInteger(value: unknown, label: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new Error(`GenLayer resolver returned an invalid ${label}`)
  }
  return parsed
}

function requireBytes32(value: unknown, label: string): `0x${string}` {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`GenLayer resolver returned an invalid ${label}`)
  }
  return value.toLowerCase() as `0x${string}`
}

function isFinalizedReceipt(receipt: unknown): boolean {
  if (!receipt || typeof receipt !== 'object') return false
  const value = receipt as { status?: unknown; statusName?: unknown; status_name?: unknown }
  for (const candidate of [value.status, value.statusName, value.status_name]) {
    if (typeof candidate === 'string' && candidate.toUpperCase() === TransactionStatus.FINALIZED) {
      return true
    }
  }
  return false
}

function getReceiptExecutionResultName(receipt: unknown): string | undefined {
  if (!receipt || typeof receipt !== 'object') {
    return undefined
  }
  const value = receipt as { txExecutionResultName?: unknown; tx_execution_result_name?: unknown }
  if (typeof value.txExecutionResultName === 'string') {
    return value.txExecutionResultName
  }
  if (typeof value.tx_execution_result_name === 'string') {
    return value.tx_execution_result_name
  }
  return undefined
}
