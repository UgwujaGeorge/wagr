import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { wagrDuelEscrowAbi, type DuelSide, type DuelStatus } from '@wagr/shared'
import { formatEther, parseEther } from 'viem'
import { useAccount, useChainId, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { VerdictPanel } from '../components/VerdictPanel'
import { demoDuels, formatCountdown, oppositeSide, statusTone } from '../lib/duels'
import { getBaseTxUrl, getEscrowAddress, hasEscrowAddress } from '../lib/contracts'
import { genlayerTxUrl, resolveOnGenLayer } from '../lib/genlayer'
import { useBaseNetwork } from '../lib/network'
import { getDuelMetadata, getRelayerConfig, getResolution, submitGenLayerResolution } from '../lib/relayer'

const zeroAddress = '0x0000000000000000000000000000000000000000'
const statusById = ['None', 'Open', 'Active', 'ResolutionRequested', 'Resolved', 'Invalid', 'Canceled', 'Paid'] as const
const verdictById = ['None', 'YES', 'NO', 'INVALID'] as const

interface ChainDuelView {
  creator: string
  counterparty?: string
  creatorSide: DuelSide
  stakeAmount: bigint
  expiry: bigint
  status: DuelStatus | 'None'
  verdict: (typeof verdictById)[number]
  creatorClaimed: boolean
  counterpartyClaimed: boolean
}

function valueAt<T>(value: unknown, key: string, index: number): T | undefined {
  const objectValue = value as Record<string, unknown>
  const arrayValue = value as readonly unknown[]
  return (objectValue?.[key] ?? arrayValue?.[index]) as T | undefined
}

function normalizeChainDuel(value: unknown): ChainDuelView | undefined {
  if (!value) return undefined

  const creator = valueAt<string>(value, 'creator', 0)
  if (!creator || creator === zeroAddress) return undefined

  const counterparty = valueAt<string>(value, 'counterparty', 1)
  const creatorSideId = Number(valueAt<number | bigint>(value, 'creatorSide', 2) || 0)
  const statusId = Number(valueAt<number | bigint>(value, 'status', 6) || 0)
  const verdictId = Number(valueAt<number | bigint>(value, 'verdict', 7) || 0)

  return {
    creator,
    counterparty: counterparty && counterparty !== zeroAddress ? counterparty : undefined,
    creatorSide: creatorSideId === 2 ? 'NO' : 'YES',
    stakeAmount: valueAt<bigint>(value, 'stakeAmount', 3) || 0n,
    expiry: valueAt<bigint>(value, 'expiry', 4) || 0n,
    status: statusById[statusId] || 'None',
    verdict: verdictById[verdictId] || 'None',
    creatorClaimed: Boolean(valueAt<boolean>(value, 'creatorClaimed', 8)),
    counterpartyClaimed: Boolean(valueAt<boolean>(value, 'counterpartyClaimed', 9)),
  }
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function sameAddress(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase())
}

function getWinnerAddress(duel: ChainDuelView | undefined): string | undefined {
  if (!duel || (duel.verdict !== 'YES' && duel.verdict !== 'NO')) return undefined
  if (duel.creatorSide === duel.verdict) return duel.creator
  return duel.counterparty
}

function isParticipant(duel: ChainDuelView | undefined, userAddress: string | undefined): boolean {
  return sameAddress(duel?.creator, userAddress) || sameAddress(duel?.counterparty, userAddress)
}

export function DuelDetailPage() {
  const { duelId } = useParams()
  const queryClient = useQueryClient()
  const { address, connector } = useAccount()
  const walletChainId = useChainId()
  const { switchChainAsync, isPending: isSwitchingBase } = useSwitchChain()
  const { selectedChainId, selectedNetwork } = useBaseNetwork()
  const [resolveStep, setResolveStep] = useState<string>()
  const [genlayerTxHash, setGenlayerTxHash] = useState<`0x${string}`>()
  const [baseActionError, setBaseActionError] = useState<string>()
  const contractAddress = getEscrowAddress(selectedChainId)
  const demoDuel = demoDuels.find((item) => item.id === duelId) || demoDuels[0]
  const isNumericDuelId = Boolean(duelId && /^\d+$/.test(duelId))
  const parsedDuelId = isNumericDuelId ? BigInt(duelId!) : 0n
  const chainReadEnabled = Boolean(contractAddress && isNumericDuelId)
  const { writeContract, isPending, data, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: data })
  const metadataQuery = useQuery({
    queryKey: ['metadata', selectedChainId, duelId],
    queryFn: () => getDuelMetadata(selectedChainId, duelId!),
    enabled: Boolean(duelId),
    retry: false,
  })
  const resolutionQuery = useQuery({
    queryKey: ['resolution', selectedChainId, duelId],
    queryFn: () => getResolution(selectedChainId, duelId!),
    enabled: Boolean(duelId),
    retry: false,
  })
  const relayerConfigQuery = useQuery({
    queryKey: ['relayer-config'],
    queryFn: getRelayerConfig,
    retry: false,
  })
  const {
    data: rawChainDuel,
    error: chainDuelError,
    isFetching: isChainDuelFetching,
    isLoading: isChainDuelLoading,
    refetch: refetchChainDuel,
  } = useReadContract({
    address: contractAddress,
    chainId: selectedChainId,
    abi: wagrDuelEscrowAbi,
    functionName: 'duels',
    args: [parsedDuelId],
    query: {
      enabled: chainReadEnabled,
      refetchInterval: chainReadEnabled ? 5_000 : false,
      staleTime: 0,
    },
  })
  const chainDuel = normalizeChainDuel(rawChainDuel)
  const metadata = metadataQuery.data
  const duel = metadata
    ? {
        id: metadata.duelId,
        claim: metadata.claim,
        category: metadata.category || 'Public evidence',
        creator: chainDuel?.creator ? shortAddress(chainDuel.creator) : 'Onchain creator',
        counterparty: chainDuel?.counterparty ? shortAddress(chainDuel.counterparty) : undefined,
        creatorSide: chainDuel?.creatorSide || metadata.creatorSide,
        stakeEth: chainDuel ? formatEther(chainDuel.stakeAmount) : '0',
        potEth: chainDuel ? formatEther(chainDuel.stakeAmount * 2n) : '0',
        expiry: chainDuel?.expiry ? new Date(Number(chainDuel.expiry) * 1000).toISOString() : metadata.expiryTime,
        status: chainDuel?.status === 'None' || !chainDuel?.status ? 'Open' : chainDuel.status,
        evidenceUrls: metadata.evidenceUrls,
        resolutionRules: metadata.resolutionRules,
        verdict: resolutionQuery.data?.verdict,
      }
    : demoDuel
  const isExpired = new Date(duel.expiry).getTime() <= Date.now()
  const isCheckingOnchainStatus = Boolean(metadata && chainReadEnabled && !chainDuel && (isChainDuelLoading || isChainDuelFetching))
  const hasOnchainDuel = Boolean(chainDuel && chainDuel.status !== 'None')
  const onchainActionDisabled = !hasEscrowAddress(selectedChainId) || !hasOnchainDuel || isPending || isConfirming || isSwitchingBase
  const statusLabel = isCheckingOnchainStatus ? 'Checking onchain' : duel.status
  const connectedWalletLabel = `${connector?.id || ''} ${connector?.name || ''}`
  const isRabbyWallet = /rabby/i.test(connectedWalletLabel)
  const canShowResolveAction = (duel.status === 'Active' || duel.status === 'ResolutionRequested') && isExpired
  const walletNeedsBaseSwitch = Boolean(address && walletChainId !== selectedChainId)
  const winnerAddress = getWinnerAddress(chainDuel)
  const connectedWalletIsWinner = sameAddress(winnerAddress, address)
  const connectedWalletIsParticipant = isParticipant(chainDuel, address)
  const payoutClaimed = Boolean(chainDuel?.creatorClaimed && chainDuel?.counterpartyClaimed)
  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!metadata) throw new Error('Relayer metadata is missing for this duel')
      if (!address) throw new Error('Connect a wallet before resolving with GenLayer')
      const config = relayerConfigQuery.data || (await getRelayerConfig())
      const selectedProvider = (await connector?.getProvider()) as Parameters<typeof resolveOnGenLayer>[3]

      setResolveStep('Switching wallet to GenLayer StudioNet')
      const genlayerResult = await resolveOnGenLayer(config, metadata, address, selectedProvider)
      setGenlayerTxHash(genlayerResult.txHash)

      setResolveStep('Submitting verified GenLayer verdict to Base')
      return submitGenLayerResolution(selectedChainId, duel.id, genlayerResult.txHash)
    },
    onSuccess: () => {
      setResolveStep(undefined)
      void queryClient.invalidateQueries({ queryKey: ['resolution', selectedChainId, duel.id] })
      void queryClient.invalidateQueries({ queryKey: ['metadata-list', selectedChainId] })
      void refetchChainDuel()
    },
    onError: () => {
      setResolveStep(undefined)
    },
  })

  useEffect(() => {
    if (!isConfirmed) return
    void refetchChainDuel()
    void queryClient.invalidateQueries({ queryKey: ['metadata-list', selectedChainId] })
    void queryClient.invalidateQueries({ queryKey: ['resolution', selectedChainId, duelId] })
  }, [duelId, isConfirmed, queryClient, refetchChainDuel, selectedChainId])

  async function ensureSelectedBaseChain() {
    if (address && walletChainId !== selectedChainId) {
      await switchChainAsync({ chainId: selectedChainId })
    }
  }

  async function runBaseAction(action: () => void) {
    setBaseActionError(undefined)
    try {
      await ensureSelectedBaseChain()
      action()
    } catch (switchError) {
      setBaseActionError(switchError instanceof Error ? switchError.message : `Could not switch wallet to ${selectedNetwork.label}.`)
    }
  }

  async function accept() {
    const contractAddress = getEscrowAddress(selectedChainId)
    if (!contractAddress) return
    await runBaseAction(() => writeContract({
      chainId: selectedChainId,
      address: contractAddress,
      abi: wagrDuelEscrowAbi,
      functionName: 'acceptDuel',
      args: [BigInt(duel.id)],
      value: chainDuel?.stakeAmount || parseEther(duel.stakeEth),
    }))
  }

  async function markResolutionRequested() {
    const contractAddress = getEscrowAddress(selectedChainId)
    if (!contractAddress) return
    await runBaseAction(() => writeContract({
      chainId: selectedChainId,
      address: contractAddress,
      abi: wagrDuelEscrowAbi,
      functionName: 'markResolutionRequested',
      args: [BigInt(duel.id)],
    }))
  }

  async function claimPayout() {
    if (!connectedWalletIsWinner) {
      setBaseActionError('Only the winning wallet can claim this payout.')
      return
    }
    const contractAddress = getEscrowAddress(selectedChainId)
    if (!contractAddress) return
    await runBaseAction(() => writeContract({
      chainId: selectedChainId,
      address: contractAddress,
      abi: wagrDuelEscrowAbi,
      functionName: 'claimPayout',
      args: [BigInt(duel.id)],
    }))
  }

  async function claimRefund() {
    if (!connectedWalletIsParticipant) {
      setBaseActionError('Only duel participants can claim refunds.')
      return
    }
    const contractAddress = getEscrowAddress(selectedChainId)
    if (!contractAddress) return
    await runBaseAction(() => writeContract({
      chainId: selectedChainId,
      address: contractAddress,
      abi: wagrDuelEscrowAbi,
      functionName: 'claimRefund',
      args: [BigInt(duel.id)],
    }))
  }

  return (
    <div className="page detail-layout">
      <section className="duel-hero panel">
        <div className="duel-card-top">
          <span className={`status-pill ${isCheckingOnchainStatus ? 'tone-pending' : statusTone(duel.status)}`}>
            {statusLabel}
          </span>
          <span className="category-pill">{duel.category}</span>
        </div>
        <h1>{duel.claim}</h1>
        <p>{duel.resolutionRules}</p>

        <div className="battle-strip">
          <div className={`battle-side ${duel.creatorSide === 'YES' ? 'yes' : 'no'}`}>
            <small>Creator</small>
            <strong>{duel.creatorSide}</strong>
            <span>{duel.creator}</span>
          </div>
          <div className="pot-display">
            <small>Total pot</small>
            <strong>{duel.potEth} ETH</strong>
            <span>Expires {formatCountdown(duel.expiry)}</span>
          </div>
          <div className={`battle-side ${oppositeSide(duel.creatorSide) === 'YES' ? 'yes' : 'no'}`}>
            <small>Counterparty</small>
            <strong>{oppositeSide(duel.creatorSide)}</strong>
            <span>{duel.counterparty || 'Open'}</span>
          </div>
        </div>

        <div className="action-row">
          {duel.status === 'Open' && isCheckingOnchainStatus && (
            <button className="secondary-action" disabled>
              Checking onchain status
            </button>
          )}
          {duel.status === 'Open' && hasOnchainDuel && (
            <button className="primary-action" disabled={onchainActionDisabled} onClick={accept}>
              {isSwitchingBase ? `Switching to ${selectedNetwork.label}` : isPending || isConfirming ? 'Accepting' : `Accept ${oppositeSide(duel.creatorSide)}`}
            </button>
          )}
          {duel.status === 'Active' && !isExpired && <button className="secondary-action">Resolution opens after expiry</button>}
          {duel.status === 'Active' && isExpired && (
            <button className="secondary-action" disabled={onchainActionDisabled} onClick={markResolutionRequested}>
              {isSwitchingBase ? `Switching to ${selectedNetwork.label}` : isPending || isConfirming ? 'Updating status' : 'Mark resolution requested'}
            </button>
          )}
          {canShowResolveAction && (
            <button
              className="primary-action"
              disabled={
                !metadata ||
                !hasOnchainDuel ||
                !address ||
                !relayerConfigQuery.data?.genlayerResolverAddress ||
                isRabbyWallet ||
                resolveMutation.isPending
              }
              onClick={() => resolveMutation.mutate()}
            >
              {resolveMutation.isPending ? 'Resolving' : 'Resolve with GenLayer'}
            </button>
          )}
          {duel.status === 'Resolved' && <Link className="primary-action" to={`/results/${duel.id}`}>View result</Link>}
          {duel.status === 'Resolved' && !connectedWalletIsWinner && (
            <button className="secondary-action" disabled>
              {address ? 'Only winner can claim' : 'Connect winner wallet'}
            </button>
          )}
          {duel.status === 'Resolved' && connectedWalletIsWinner && (
            <button className="secondary-action" disabled={onchainActionDisabled || payoutClaimed} onClick={claimPayout}>
              {isSwitchingBase ? `Switching to ${selectedNetwork.label}` : isPending || isConfirming ? 'Claiming' : payoutClaimed ? 'Payout claimed' : 'Claim payout'}
            </button>
          )}
          {duel.status === 'Invalid' && (
            <button className="secondary-action" disabled={onchainActionDisabled || !connectedWalletIsParticipant} onClick={claimRefund}>
              {isSwitchingBase ? `Switching to ${selectedNetwork.label}` : isPending || isConfirming ? 'Claiming' : 'Claim refund'}
            </button>
          )}
        </div>
        {canShowResolveAction && (
          <p className="resolve-wallet-note muted">
            GenLayer resolution requires MetaMask because StudioNet uses the GenLayer MetaMask Snap. Rabby can still be used for
            {` ${selectedNetwork.label} actions.`}
          </p>
        )}
        {!hasEscrowAddress(selectedChainId) && (
          <p className="warning-text">
            Onchain actions unlock after the {selectedNetwork.label} escrow contract is deployed and {selectedNetwork.envKey} is set.
          </p>
        )}
        {!selectedNetwork.isTestnet && (
          <p className="warning-text">You are using Base Mainnet. Real funds may be involved.</p>
        )}
        {walletNeedsBaseSwitch && (
          <p className="warning-text">Base actions will switch your wallet back to {selectedNetwork.label} before opening the transaction.</p>
        )}
        {duel.status === 'Resolved' && winnerAddress && (
          <p className="muted">Winning wallet: {shortAddress(winnerAddress)}</p>
        )}
        {metadata && chainReadEnabled && !chainDuel && !isCheckingOnchainStatus && (
          <p className="warning-text">No deployed duel was found for this id yet. Refresh after the creation transaction confirms.</p>
        )}
        {chainDuelError && <p className="warning-text">Could not refresh onchain duel status: {chainDuelError.message}</p>}
        {!metadata && (duel.status === 'Active' || duel.status === 'ResolutionRequested') && (
          <p className="warning-text">Relayer metadata is missing for this duel, so it cannot be resolved from the app yet.</p>
        )}
        {metadata && !address && (duel.status === 'Active' || duel.status === 'ResolutionRequested') && isExpired && (
          <p className="warning-text">Connect a wallet to sign the GenLayer StudioNet resolution transaction.</p>
        )}
        {metadata && address && isRabbyWallet && canShowResolveAction && (
          <p className="warning-text">
            Rabby works for {selectedNetwork.label} actions, but GenLayer StudioNet resolution currently requires MetaMask Snap support.
            Disconnect Rabby and connect MetaMask before resolving.
          </p>
        )}
        {metadata && relayerConfigQuery.data && !relayerConfigQuery.data.genlayerResolverAddress && (
          <p className="warning-text">Deploy the GenLayer resolver and set GENLAYER_RESOLVER_ADDRESS before resolving duels.</p>
        )}
        {relayerConfigQuery.error && <p className="warning-text">Could not load GenLayer config: {relayerConfigQuery.error.message}</p>}
        {resolveStep && <p className="muted">{resolveStep}</p>}
        {genlayerTxHash && relayerConfigQuery.data && (
          <p className="success-text">
            GenLayer transaction submitted:{' '}
            <a href={genlayerTxUrl(relayerConfigQuery.data, genlayerTxHash)} target="_blank" rel="noreferrer">
              {genlayerTxHash}
            </a>
          </p>
        )}
        {resolveMutation.error && <p className="warning-text">{resolveMutation.error.message}</p>}
        {baseActionError && <p className="warning-text">{baseActionError}</p>}
        {resolveMutation.data && <p className="success-text">{resolveMutation.data.nextStep}</p>}
        {resolveMutation.data?.baseTxHash && (
          <p className="success-text">
            Base verdict transaction:{' '}
            <a href={getBaseTxUrl(selectedChainId, resolveMutation.data.baseTxHash)} target="_blank" rel="noreferrer">
              {resolveMutation.data.baseTxHash}
            </a>
          </p>
        )}
        {error && <p className="warning-text">{error.message}</p>}
        {data && (
          <p className="success-text">
            Transaction submitted:{' '}
            <a href={getBaseTxUrl(selectedChainId, data)} target="_blank" rel="noreferrer">
              {data}
            </a>
          </p>
        )}
        {isConfirming && <p className="muted">Waiting for {selectedNetwork.label} confirmation, then this page will refresh onchain status.</p>}
      </section>

      <aside className="detail-side">
        <section className="panel">
          <div className="panel-heading">
            <span>Evidence</span>
            <strong>{duel.evidenceUrls.length}</strong>
          </div>
          <ul className="source-list">
            {duel.evidenceUrls.map((url) => (
              <li key={url}>
                <span>{url}</span>
                <strong>public</strong>
              </li>
            ))}
          </ul>
        </section>
        <VerdictPanel verdict={duel.verdict} />
      </aside>
    </div>
  )
}
