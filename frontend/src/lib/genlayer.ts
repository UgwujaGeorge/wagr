import { baseSepolia, type GenLayerVerdict } from '@wagr/shared'
import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { ExecutionResult, TransactionStatus } from 'genlayer-js/types'
import type { StoredDuelMetadata } from './relayer'

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

export interface GenLayerConfig {
  genlayerChainId: number
  genlayerRpcUrl: string
  genlayerExplorerUrl: string
  genlayerResolverAddress?: `0x${string}`
}

export interface GenLayerResolveResult {
  txHash: `0x${string}`
  verdict: GenLayerVerdict
}

export async function resolveOnGenLayer(
  config: GenLayerConfig,
  metadata: StoredDuelMetadata,
  walletAddress: `0x${string}`,
  provider: EthereumProvider | undefined,
): Promise<GenLayerResolveResult> {
  if (!provider) {
    throw new Error('Connect a browser wallet that supports GenLayer StudioNet')
  }
  if (!config.genlayerResolverAddress) {
    throw new Error('GENLAYER_RESOLVER_ADDRESS is not configured on the relayer')
  }

  const readClient = createClient({
    chain: studionet,
    endpoint: config.genlayerRpcUrl,
  })
  const writeClient = createClient({
    chain: studionet,
    endpoint: config.genlayerRpcUrl,
    account: walletAddress,
    provider,
  })

  await prepareGenLayerWallet(config, provider)
  const genlayerDuelId = getGenLayerDuelId(metadata.chainId, metadata.duelId)

  const txHash = await writeClient.writeContract({
    address: config.genlayerResolverAddress,
    functionName: 'resolve_duel',
    args: [
      genlayerDuelId,
      metadata.claim,
      metadata.resolutionRules,
      metadata.expiryTime,
      metadata.evidenceUrls,
      metadata.allowedSourceTypes,
      metadata.creatorSide,
      metadata.counterpartySide,
      metadata.metadataHash,
    ],
    value: 0n,
  })

  const receipt = await readClient.waitForTransactionReceipt({
    hash: txHash,
    status: TransactionStatus.ACCEPTED,
    interval: 5_000,
    retries: 120,
  })

  if (getReceiptExecutionResultName(receipt) === ExecutionResult.FINISHED_WITH_ERROR) {
    throw new Error('GenLayer accepted the transaction but the resolver execution failed')
  }

  const resolutionJson = await readClient.readContract({
    address: config.genlayerResolverAddress,
    functionName: 'get_resolution_json',
    args: [genlayerDuelId],
  })

  if (typeof resolutionJson !== 'string') {
    throw new Error('GenLayer resolver returned an unexpected response')
  }

  return {
    txHash,
    verdict: parseGenLayerVerdict(resolutionJson),
  }
}

function getGenLayerDuelId(chainId: number, duelId: string): string {
  return chainId === baseSepolia.id ? duelId : `${chainId}:${duelId}`
}

async function prepareGenLayerWallet(config: GenLayerConfig, provider: EthereumProvider) {
  const chainIdHex = `0x${studionet.id.toString(16)}`

  try {
    const currentChainId = await provider.request({ method: 'eth_chainId' })
    if (currentChainId !== chainIdHex) {
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] })
      } catch (switchError) {
        if (!isUnknownChainError(switchError)) {
          throw switchError
        }
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: chainIdHex,
              chainName: studionet.name,
              rpcUrls: [config.genlayerRpcUrl],
              nativeCurrency: studionet.nativeCurrency,
              blockExplorerUrls: [config.genlayerExplorerUrl],
            },
          ],
        })
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] })
      }
    }
  } catch (error) {
    throw normalizeGenLayerWalletError(error)
  }

  try {
    const installedSnaps = await provider.request({ method: 'wallet_getSnaps' })
    const hasGenLayerSnap =
      installedSnaps &&
      typeof installedSnaps === 'object' &&
      Object.values(installedSnaps).some((snap) => isGenLayerSnap(snap))

    if (!hasGenLayerSnap) {
      await provider.request({
        method: 'wallet_requestSnaps',
        params: {
          'npm:genlayer-wallet-plugin': {},
        },
      })
    }
  } catch (error) {
    throw normalizeGenLayerWalletError(error)
  }
}

function isGenLayerSnap(value: unknown) {
  return Boolean(value && typeof value === 'object' && (value as { id?: unknown }).id === 'npm:genlayer-wallet-plugin')
}

function isUnknownChainError(error: unknown) {
  const value = error as { code?: unknown; data?: { originalError?: { code?: unknown } } }
  return value?.code === 4902 || value?.data?.originalError?.code === 4902
}

function normalizeGenLayerWalletError(error: unknown) {
  if (isMissingSnapMethodError(error)) {
    return new Error(
      'GenLayer StudioNet resolution currently requires MetaMask Snap support. Rabby does not support wallet_getSnaps, so use MetaMask for the Resolve with GenLayer step.',
    )
  }
  if (isUserRejectedError(error)) {
    return new Error('GenLayer wallet setup was cancelled in the wallet.')
  }
  if (error instanceof Error) {
    return error
  }
  return new Error('Could not prepare the wallet for GenLayer StudioNet.')
}

function isMissingSnapMethodError(error: unknown) {
  const value = error as { code?: unknown; message?: unknown; details?: unknown }
  const message = `${String(value?.message || '')} ${String(value?.details || '')}`.toLowerCase()
  return message.includes('wallet_getsnaps') || message.includes('wallet_requestsnaps') || value?.code === -32601
}

function isUserRejectedError(error: unknown) {
  const value = error as { code?: unknown; message?: unknown }
  const message = String(value?.message || '').toLowerCase()
  return value?.code === 4001 || message.includes('user rejected') || message.includes('user denied')
}

export function genlayerTxUrl(config: GenLayerConfig, txHash: string): string {
  return `${config.genlayerExplorerUrl.replace(/\/$/, '')}/tx/${txHash}`
}

function parseGenLayerVerdict(value: string): GenLayerVerdict {
  const parsed = JSON.parse(value) as Partial<GenLayerVerdict>
  const verdict = parsed.verdict
  if (verdict !== 'YES' && verdict !== 'NO' && verdict !== 'INVALID' && verdict !== 'UNRESOLVED') {
    throw new Error('GenLayer resolver returned an invalid verdict')
  }

  return {
    verdict,
    confidence: Number(parsed.confidence || 0),
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
