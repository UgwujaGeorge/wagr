import {
  authenticatedDuelDataHash,
  canonicalGenLayerDuelId,
  duelMetadataHash,
  expiryTimeIso,
  genlayerResolveArgs,
  type AuthenticatedDuelData,
  type GenLayerVerdict,
} from '@wagr/shared'
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
  /** Absent when GenLayer had already resolved this duel and no new transaction was sent. */
  txHash?: `0x${string}`
  verdict: GenLayerVerdict
  alreadyResolved: boolean
}

const GENLAYER_RECEIPT_WAIT_INTERVAL_MS = 5_000
const GENLAYER_RECEIPT_WAIT_RETRIES = 84

export async function resolveOnGenLayer(
  config: GenLayerConfig,
  metadata: StoredDuelMetadata,
  authenticatedDuel: AuthenticatedDuelData,
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
  const genlayerDuelId = canonicalGenLayerDuelId(metadata.chainId, metadata.duelId)
  if (authenticatedDuel.chainId !== metadata.chainId || authenticatedDuel.duelId !== metadata.duelId) {
    throw new Error('Base duel data does not match the selected duel')
  }
  if (authenticatedDuel.metadataHash.toLowerCase() !== metadata.metadataHash.toLowerCase()) {
    throw new Error('Base duel metadata hash does not match relayer metadata')
  }
  // Re-derive the commitment locally: the resolver will reject anything else,
  // and failing here gives a far clearer error than a GenLayer revert.
  if (duelMetadataHash(toCommitted(metadata)).toLowerCase() !== metadata.metadataHash.toLowerCase()) {
    throw new Error('Relayer metadata does not match its own committed hash')
  }
  // The expiry shown in the app comes from the relayer; the one the resolver is
  // bound to comes from Base. They must be the same expiry.
  const baseExpiry = expiryTimeIso(authenticatedDuel.expiry)
  if (baseExpiry !== expiryTimeIso(Math.floor(new Date(metadata.expiryTime).getTime() / 1000))) {
    throw new Error(`Relayer metadata expiry does not match the Base duel expiry of ${baseExpiry}`)
  }
  // The resolver refuses to adjudicate before expiry, because a verdict reached
  // over evidence that has not happened yet would be a wrong answer nobody can
  // replace. Say so here rather than sending a transaction that must revert.
  if (Date.now() < Number(authenticatedDuel.expiry) * 1000) {
    throw new Error(`This duel cannot be resolved until it expires at ${baseExpiry}.`)
  }
  const duelDataHash = authenticatedDuelDataHash(authenticatedDuel)

  // The resolver refuses a second resolve_duel once it holds a final verdict
  // for this duel under this exact Base state. If a previous attempt resolved
  // on GenLayer but never reached Base, resolving again would fail, so reuse
  // the stored verdict and let the caller retry only the Base submission. An
  // UNRESOLVED result is not final and is deliberately retried instead.
  const existing = await readStoredVerdict(readClient, config, genlayerDuelId, duelDataHash)
  if (existing && existing.verdict !== 'UNRESOLVED' && verdictMatchesDuel(existing, genlayerDuelId, duelDataHash, metadata.metadataHash)) {
    return { verdict: existing, alreadyResolved: true }
  }

  const txHash = await writeClient.writeContract({
    address: config.genlayerResolverAddress,
    functionName: 'resolve_duel',
    // Built from the authenticated Base duel, never from the relayer's copy of
    // the expiry or the sides: the resolver recomputes duelDataHash from these
    // very arguments and rejects anything Base does not vouch for.
    args: [...genlayerResolveArgs(authenticatedDuel, toCommitted(metadata))],
    value: 0n,
  })

  const receipt = await readClient.waitForTransactionReceipt({
    hash: txHash,
    status: TransactionStatus.ACCEPTED,
    interval: GENLAYER_RECEIPT_WAIT_INTERVAL_MS,
    retries: GENLAYER_RECEIPT_WAIT_RETRIES,
  })

  if (getReceiptExecutionResultName(receipt) === ExecutionResult.FINISHED_WITH_ERROR) {
    throw new Error('GenLayer accepted the transaction but the resolver execution failed')
  }

  const resolutionJson = await readClient.readContract({
    address: config.genlayerResolverAddress,
    functionName: 'get_resolution_json',
    args: [genlayerDuelId, duelDataHash],
  })

  if (typeof resolutionJson !== 'string') {
    throw new Error('GenLayer resolver returned an unexpected response')
  }

  return {
    txHash,
    verdict: parseGenLayerVerdict(resolutionJson),
    alreadyResolved: false,
  }
}

function toCommitted(metadata: StoredDuelMetadata) {
  return {
    claim: metadata.claim,
    resolutionRules: metadata.resolutionRules,
    evidenceUrls: metadata.evidenceUrls,
    allowedSourceTypes: metadata.allowedSourceTypes,
    allowedDomains: metadata.allowedDomains,
    category: metadata.category || '',
  }
}

type GenLayerReadClient = ReturnType<typeof createClient>

async function readStoredVerdict(
  readClient: GenLayerReadClient,
  config: GenLayerConfig,
  genlayerDuelId: string,
  duelDataHash: `0x${string}`,
): Promise<GenLayerVerdict | undefined> {
  try {
    const resolutionJson = await readClient.readContract({
      address: config.genlayerResolverAddress as `0x${string}`,
      functionName: 'get_resolution_json',
      args: [genlayerDuelId, duelDataHash],
    })
    if (typeof resolutionJson !== 'string') return undefined
    return parseGenLayerVerdict(resolutionJson)
  } catch {
    // A read failure here must not block a first-time resolution.
    return undefined
  }
}

function verdictMatchesDuel(
  verdict: GenLayerVerdict,
  genlayerDuelId: string,
  duelDataHash: `0x${string}`,
  metadataHash: string,
): boolean {
  return (
    verdict.duel_id === genlayerDuelId &&
    verdict.metadata_hash.toLowerCase() === metadataHash.toLowerCase() &&
    verdict.authenticated_duel_data_hash.toLowerCase() === duelDataHash.toLowerCase()
  )
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
    resolution_scope: String(parsed.resolution_scope || ''),
    duel_id: String(parsed.duel_id || ''),
    base_chain_id: Number(parsed.base_chain_id || 0),
    base_duel_id: String(parsed.base_duel_id || ''),
    metadata_hash: String(parsed.metadata_hash || ''),
    authenticated_duel_data_hash: String(parsed.authenticated_duel_data_hash || ''),
    expiry_time: String(parsed.expiry_time || ''),
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
