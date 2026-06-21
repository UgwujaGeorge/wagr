import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { wagrDuelEscrowAbi, WAGR_DATA_SUFFIX } from '@wagr/shared'
import { parseEther } from 'viem'
import { useAccount, useChainId, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { VerdictPanel } from '../components/VerdictPanel'
import { WrongNetworkModal } from '../components/WrongNetworkModal'
import { formatCountdown, oppositeSide, statusTone } from '../lib/duels'
import { canClaimPayout, canClaimRefund, getWinnerAddress, isParticipant, sameAddress, useLiveDuel } from '../lib/duelData'
import { getBaseTxUrl, getEscrowAddress, hasEscrowAddress } from '../lib/contracts'
import { genlayerTxUrl, resolveOnGenLayer } from '../lib/genlayer'
import { useBaseNetwork } from '../lib/network'
import { getRelayerConfig, getResolution, submitGenLayerResolution } from '../lib/relayer'
import { describeUiError, isWrongNetworkError, logUiError } from '../lib/uiErrors'

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
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
  const [wrongNetworkModalOpen, setWrongNetworkModalOpen] = useState(false)
  const { duel, metadata, chain, error: duelError, isLoading, isChainLoading, isChainFetching } = useLiveDuel(selectedChainId, duelId)
  const { writeContract, isPending, data, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: data })
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

  useEffect(() => {
    if (duelError) {
      logUiError('Failed to load duel detail', duelError)
    }
  }, [duelError])

  useEffect(() => {
    if (resolutionQuery.error) {
      logUiError('Failed to load duel resolution', resolutionQuery.error)
    }
  }, [resolutionQuery.error])

  useEffect(() => {
    if (relayerConfigQuery.error) {
      logUiError('Failed to load relayer config', relayerConfigQuery.error)
    }
  }, [relayerConfigQuery.error])

  useEffect(() => {
    if (error) {
      logUiError('Duel detail transaction error', error)
    }
  }, [error])

  const isCheckingOnchainStatus = Boolean(metadata && (isChainLoading || isChainFetching))
  const hasOnchainDuel = Boolean(chain && chain.status !== 'None')
  const isExpired = duel ? new Date(duel.expiry).getTime() <= Date.now() : false
  const statusLabel = duel ? (isCheckingOnchainStatus ? 'Checking onchain' : duel.status) : 'Loading'
  const connectedWalletLabel = `${connector?.id || ''} ${connector?.name || ''}`
  const isRabbyWallet = /rabby/i.test(connectedWalletLabel)
  const canShowResolveAction = Boolean(duel && (duel.status === 'Active' || duel.status === 'ResolutionRequested') && isExpired)
  const walletNeedsBaseSwitch = Boolean(address && walletChainId !== selectedChainId)
  const winnerAddress = getWinnerAddress(chain)
  const connectedWalletIsWinner = sameAddress(winnerAddress, address)
  const connectedWalletIsParticipant = isParticipant(chain, address)
  const payoutClaimed = Boolean(chain?.creatorClaimed && chain?.counterpartyClaimed)
  const onchainActionDisabled = !hasEscrowAddress(selectedChainId) || !hasOnchainDuel || isPending || isConfirming || isSwitchingBase
  const verdict = resolutionQuery.data?.verdict

  useEffect(() => {
    if (!isConfirmed || !duel) return
    void queryClient.invalidateQueries({ queryKey: ['resolution', selectedChainId, duel.id] })
    void queryClient.invalidateQueries({ queryKey: ['metadata-list', selectedChainId] })
  }, [duel, isConfirmed, queryClient, selectedChainId])

  async function ensureSelectedBaseChain() {
    if (!address || walletChainId === selectedChainId) return true

    try {
      await switchChainAsync({ chainId: selectedChainId })
      return true
    } catch (switchError) {
      logUiError('Failed to switch Base network', switchError)
      if (isWrongNetworkError(switchError)) {
        setWrongNetworkModalOpen(true)
      } else {
        setBaseActionError(describeUiError(switchError))
      }
      return false
    }
  }

  async function runBaseAction(action: () => void) {
    setBaseActionError(undefined)

    if (!(await ensureSelectedBaseChain())) {
      return
    }

    try {
      action()
    } catch (actionError) {
      logUiError('Base action failed', actionError)
      if (isWrongNetworkError(actionError)) {
        setWrongNetworkModalOpen(true)
        return
      }
      setBaseActionError(describeUiError(actionError))
    }
  }

  async function accept() {
    const contractAddress = getEscrowAddress(selectedChainId)
    if (!contractAddress || !duel) return
    await runBaseAction(() =>
      writeContract({
        chainId: selectedChainId,
        address: contractAddress,
        abi: wagrDuelEscrowAbi,
        functionName: 'acceptDuel',
        args: [BigInt(duel.id)],
        value: chain?.stakeAmount || parseEther(duel.stakeEth),
        dataSuffix: WAGR_DATA_SUFFIX,
      }),
    )
  }

  async function markResolutionRequested() {
    const contractAddress = getEscrowAddress(selectedChainId)
    if (!contractAddress || !duel) return
    await runBaseAction(() =>
      writeContract({
        chainId: selectedChainId,
        address: contractAddress,
        abi: wagrDuelEscrowAbi,
        functionName: 'markResolutionRequested',
        args: [BigInt(duel.id)],
        dataSuffix: WAGR_DATA_SUFFIX,
      }),
    )
  }

  async function claimPayout() {
    if (!duel) return
    if (!connectedWalletIsWinner) {
      setBaseActionError('Only the winning wallet can claim this payout.')
      return
    }
    const contractAddress = getEscrowAddress(selectedChainId)
    if (!contractAddress) return
    await runBaseAction(() =>
      writeContract({
        chainId: selectedChainId,
        address: contractAddress,
        abi: wagrDuelEscrowAbi,
        functionName: 'claimPayout',
        args: [BigInt(duel.id)],
        dataSuffix: WAGR_DATA_SUFFIX,
      }),
    )
  }

  async function claimRefund() {
    if (!duel) return
    if (!connectedWalletIsParticipant) {
      setBaseActionError('Only duel participants can claim refunds.')
      return
    }
    const contractAddress = getEscrowAddress(selectedChainId)
    if (!contractAddress) return
    await runBaseAction(() =>
      writeContract({
        chainId: selectedChainId,
        address: contractAddress,
        abi: wagrDuelEscrowAbi,
        functionName: 'claimRefund',
        args: [BigInt(duel.id)],
        dataSuffix: WAGR_DATA_SUFFIX,
      }),
    )
  }

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!metadata || !duel) throw new Error('Relayer metadata is missing for this duel')
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
      if (!duel) return
      void queryClient.invalidateQueries({ queryKey: ['resolution', selectedChainId, duel.id] })
      void queryClient.invalidateQueries({ queryKey: ['metadata-list', selectedChainId] })
    },
    onError: (mutationError) => {
      logUiError('GenLayer resolution failed', mutationError)
      setResolveStep(undefined)
    },
  })

  if (isLoading && !duel) {
    return (
      <div className="page detail-layout">
        <section className="panel duel-hero">
          <span className="eyebrow">Loading duel</span>
          <h1>Fetching live duel data.</h1>
          <p>Please wait while the relayer and chain state load.</p>
        </section>
      </div>
    )
  }

  if (!duel) {
    return (
      <div className="page detail-layout">
        <section className="panel duel-hero">
          <span className="eyebrow">Missing duel</span>
          <h1>Not found.</h1>
          <p>{duelError ? describeUiError(duelError) : 'This duel could not be loaded from the live data source.'}</p>
          <Link className="secondary-action" to="/explore">
            Back to explore
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className="page detail-layout">
      <section className="duel-hero panel">
        <div className="duel-card-top">
          <span className={`status-pill ${isCheckingOnchainStatus ? 'tone-pending' : statusTone(duel.status)}`}>{statusLabel}</span>
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
              disabled={!metadata || !hasOnchainDuel || !address || !relayerConfigQuery.data?.genlayerResolverAddress || isRabbyWallet || resolveMutation.isPending}
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
            GenLayer resolution requires MetaMask because StudioNet uses the GenLayer MetaMask Snap. Rabby can still be used for {` ${selectedNetwork.label} actions.`}
          </p>
        )}
        {!hasEscrowAddress(selectedChainId) && (
          <p className="warning-text">Onchain actions unlock after the {selectedNetwork.label} escrow contract is deployed and {selectedNetwork.envKey} is set.</p>
        )}
        {!selectedNetwork.isTestnet && <p className="warning-text">You are using Base Mainnet. Real funds may be involved.</p>}
        {walletNeedsBaseSwitch && <p className="warning-text">Base actions will switch your wallet back to {selectedNetwork.label} before opening the transaction.</p>}
        {duel.status === 'Resolved' && winnerAddress && <p className="muted">Winning wallet: {shortAddress(winnerAddress)}</p>}
        {metadata && (duel.status === 'Active' || duel.status === 'ResolutionRequested') && !chain && !isCheckingOnchainStatus && (
          <p className="warning-text">No deployed duel was found for this id yet. Refresh after the creation transaction confirms.</p>
        )}
        {duelError && <p className="warning-text">{describeUiError(duelError)}</p>}
        {!metadata && (duel.status === 'Active' || duel.status === 'ResolutionRequested') && <p className="warning-text">Relayer metadata is missing for this duel, so it cannot be resolved from the app yet.</p>}
        {metadata && !address && (duel.status === 'Active' || duel.status === 'ResolutionRequested') && isExpired && <p className="warning-text">Connect a wallet to sign the GenLayer StudioNet resolution transaction.</p>}
        {metadata && address && isRabbyWallet && canShowResolveAction && (
          <p className="warning-text">
            Rabby works for {selectedNetwork.label} actions, but GenLayer StudioNet resolution currently requires MetaMask Snap support. Disconnect Rabby and connect MetaMask before resolving.
          </p>
        )}
        {metadata && relayerConfigQuery.data && !relayerConfigQuery.data.genlayerResolverAddress && <p className="warning-text">Deploy the GenLayer resolver and set GENLAYER_RESOLVER_ADDRESS before resolving duels.</p>}
        {resolutionQuery.error && <p className="warning-text">{describeUiError(resolutionQuery.error)}</p>}
        {relayerConfigQuery.error && <p className="warning-text">{describeUiError(relayerConfigQuery.error)}</p>}
        {resolveStep && <p className="muted">{resolveStep}</p>}
        {genlayerTxHash && relayerConfigQuery.data && (
          <p className="success-text">
            GenLayer transaction submitted:{' '}
            <a href={genlayerTxUrl(relayerConfigQuery.data, genlayerTxHash)} target="_blank" rel="noreferrer">
              {genlayerTxHash}
            </a>
          </p>
        )}
        {resolveMutation.error && <p className="warning-text">{describeUiError(resolveMutation.error)}</p>}
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
        {error && <p className="warning-text">{describeUiError(error)}</p>}
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
        <VerdictPanel verdict={verdict} />
      </aside>

      <WrongNetworkModal
        isOpen={wrongNetworkModalOpen}
        isSwitching={isSwitchingBase}
        onCancel={() => setWrongNetworkModalOpen(false)}
        onSwitch={async () => {
          try {
            await switchChainAsync({ chainId: selectedChainId })
            setWrongNetworkModalOpen(false)
          } catch (switchError) {
            logUiError('Wrong network modal switch failed', switchError)
            if (!isWrongNetworkError(switchError)) {
              setBaseActionError(describeUiError(switchError))
            }
          }
        }}
      />
    </div>
  )
}
