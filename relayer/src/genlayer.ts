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

export async function readResolutionFromGenLayer(
  config: RelayerConfig,
  duelId: string,
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
    const receipt = await client.waitForTransactionReceipt({
      hash: genlayerTxHash as TransactionHash,
      status: TransactionStatus.ACCEPTED,
      interval: GENLAYER_RECEIPT_WAIT_INTERVAL_MS,
      retries: GENLAYER_RECEIPT_WAIT_RETRIES,
    })

    if (getReceiptExecutionResultName(receipt) === ExecutionResult.FINISHED_WITH_ERROR) {
      throw new Error(`GenLayer resolution transaction failed: ${genlayerTxHash}`)
    }
  }

  const resolutionJson = await client.readContract({
    address: config.genlayerResolverAddress,
    functionName: 'get_resolution_json',
    args: [duelId],
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

  return {
    verdict,
    confidence,
    evidence_summary: String(parsed.evidence_summary || ''),
    sources_checked: Array.isArray(parsed.sources_checked) ? parsed.sources_checked : [],
    reasoning: String(parsed.reasoning || ''),
    resolved_at: String(parsed.resolved_at || ''),
    invalid_reason: String(parsed.invalid_reason || ''),
  }
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
