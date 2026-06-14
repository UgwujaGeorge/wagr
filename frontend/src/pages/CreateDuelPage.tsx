import { FormEvent, useEffect, useMemo, useState } from 'react'
import { wagrDuelEscrowAbi } from '@wagr/shared'
import { keccak256, parseEther, parseEventLogs, stringToHex } from 'viem'
import { Link, useNavigate } from 'react-router-dom'
import { useAccount, useChainId, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { getBaseTxUrl, getEscrowAddress, hasEscrowAddress } from '../lib/contracts'
import { oppositeSide } from '../lib/duels'
import { useBaseNetwork } from '../lib/network'
import { saveDuelMetadata, type StoredDuelMetadata } from '../lib/relayer'

export function CreateDuelPage() {
  const navigate = useNavigate()
  const { selectedChainId, selectedNetwork } = useBaseNetwork()
  const { address } = useAccount()
  const walletChainId = useChainId()
  const { switchChainAsync, isPending: isSwitchingBase } = useSwitchChain()
  const [side, setSide] = useState<'YES' | 'NO'>('YES')
  const [claim, setClaim] = useState('Will GitHub issue #42 be closed before Friday 18:00 UTC?')
  const [rules, setRules] = useState(
    'YES if the linked GitHub issue is closed before the expiry timestamp. NO if it remains open. INVALID if the issue cannot be accessed.',
  )
  const [evidence, setEvidence] = useState('https://github.com/example/project/issues/42')
  const [stake, setStake] = useState('0.01')
  const [expiry, setExpiry] = useState('')
  const [pendingMetadata, setPendingMetadata] = useState<Omit<StoredDuelMetadata, 'duelId'> | undefined>()
  const [savedTxHash, setSavedTxHash] = useState<string>()
  const [savedDuelId, setSavedDuelId] = useState<string>()
  const [relayerError, setRelayerError] = useState<string>()
  const [walletActionError, setWalletActionError] = useState<string>()
  const { writeContract, isPending, data, error } = useWriteContract()
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: data })

  const metadata = useMemo(
    () => ({
      claim,
      resolutionRules: rules,
      evidenceUrls: evidence.split('\n').map((url) => url.trim()).filter(Boolean),
      allowedSourceTypes: ['official website', 'official docs', 'GitHub issue', 'GitHub release', 'verified public announcement'],
      category: 'GitHub',
    }),
    [claim, rules, evidence],
  )

  const metadataHash = useMemo(() => keccak256(stringToHex(JSON.stringify(metadata))), [metadata])

  async function ensureSelectedBaseChain() {
    if (address && walletChainId !== selectedChainId) {
      await switchChainAsync({ chainId: selectedChainId })
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const contractAddress = getEscrowAddress(selectedChainId)
    if (!contractAddress) return
    const expirySeconds = Math.floor(new Date(expiry).getTime() / 1000)
    if (!Number.isFinite(expirySeconds)) return
    setRelayerError(undefined)
    setWalletActionError(undefined)
    setSavedDuelId(undefined)
    try {
      await ensureSelectedBaseChain()
      setPendingMetadata({
        ...metadata,
        chainId: selectedChainId,
        expiryTime: new Date(expiry).toISOString(),
        creatorSide: side,
        counterpartySide: side === 'YES' ? 'NO' : 'YES',
        metadataHash,
      })
      writeContract({
        chainId: selectedChainId,
        address: contractAddress,
        abi: wagrDuelEscrowAbi,
        functionName: 'createDuel',
        args: [side === 'YES' ? 1 : 2, BigInt(expirySeconds), metadataHash],
        value: parseEther(stake),
      })
    } catch (switchError) {
      setWalletActionError(switchError instanceof Error ? switchError.message : `Could not switch wallet to ${selectedNetwork.label}.`)
    }
  }

  useEffect(() => {
    if (!data || !receipt || !pendingMetadata || savedTxHash === data) return
    const confirmedReceipt = receipt
    const metadataToSave = pendingMetadata

    async function persistMetadata() {
      try {
        const logs = parseEventLogs({
          abi: wagrDuelEscrowAbi,
          eventName: 'DuelCreated',
          logs: confirmedReceipt.logs,
        })
        const duelId = logs[0]?.args.duelId?.toString()
        if (!duelId) {
          throw new Error('DuelCreated event was not found in the transaction receipt')
        }

        await saveDuelMetadata({ duelId, ...metadataToSave })
        setSavedTxHash(data)
        setSavedDuelId(duelId)
        navigate(`/duels/${duelId}`)
      } catch (metadataError) {
        setRelayerError(metadataError instanceof Error ? metadataError.message : String(metadataError))
      }
    }

    void persistMetadata()
  }, [data, navigate, pendingMetadata, receipt, savedTxHash])

  return (
    <div className="page create-layout">
      <section className="page-heading">
        <span className="eyebrow">Issue a challenge</span>
        <h1>Draft the terms of combat.</h1>
        <p>Write a precise claim, lock your side, and define the public evidence GenLayer should judge after expiry.</p>
      </section>

      <div className="create-workbench">
        <form className="create-form panel" onSubmit={onSubmit}>
          <label>
            <span>Claim</span>
            <small>The sentence both sides are wagering on.</small>
            <textarea value={claim} onChange={(event) => setClaim(event.target.value)} rows={3} />
          </label>

          <label>
            <span>Resolution rules</span>
            <small>Define exactly what YES, NO, and INVALID mean.</small>
            <textarea value={rules} onChange={(event) => setRules(event.target.value)} rows={5} />
          </label>

          <label>
            <span>Evidence URLs</span>
            <small>One public source per line. GenLayer reads these after expiry.</small>
            <textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} rows={4} />
          </label>

          <div className="form-grid">
            <label>
              <span>Expiry</span>
              <input type="datetime-local" value={expiry} onChange={(event) => setExpiry(event.target.value)} />
            </label>
            <label>
              <span>Stake, ETH</span>
              <input value={stake} onChange={(event) => setStake(event.target.value)} />
            </label>
          </div>

          <div className="side-picker" aria-label="Choose your duel side">
            <button type="button" className={side === 'YES' ? 'yes selected' : 'yes'} onClick={() => setSide('YES')}>
              <span>YES</span>
              <small>You assert the claim will be true.</small>
            </button>
            <button type="button" className={side === 'NO' ? 'no selected' : 'no'} onClick={() => setSide('NO')}>
              <span>NO</span>
              <small>You challenge the claim.</small>
            </button>
          </div>

          <div className="metadata-box">
            <small>Metadata hash</small>
            <code>{metadataHash}</code>
          </div>

          {!hasEscrowAddress(selectedChainId) && (
            <p className="warning-text">
              Set {selectedNetwork.envKey} after the {selectedNetwork.label} deployment to enable onchain creation.
            </p>
          )}
          {!selectedNetwork.isTestnet && (
            <p className="warning-text">You are using Base Mainnet. Real funds may be involved.</p>
          )}
          {address && walletChainId !== selectedChainId && (
            <p className="warning-text">Your wallet will switch to {selectedNetwork.label} before creating this duel.</p>
          )}
          {!address && <p className="warning-text">Connect a wallet to create this duel.</p>}
          {walletActionError && <p className="warning-text">{walletActionError}</p>}
          {error && <p className="warning-text">{error.message}</p>}
          {data && (
            <p className="success-text">
              Transaction submitted:{' '}
              <a href={getBaseTxUrl(selectedChainId, data)} target="_blank" rel="noreferrer">
                {data}
              </a>
            </p>
          )}
          {isConfirming && <p className="muted">Waiting for {selectedNetwork.label} confirmation before saving relayer metadata.</p>}
          {savedDuelId && <p className="success-text">Duel metadata saved for #{savedDuelId}.</p>}
          {relayerError && (
            <p className="warning-text">
              Onchain transaction confirmed, but relayer metadata was not saved: {relayerError}
            </p>
          )}

          <button
            className="primary-action full"
            disabled={!hasEscrowAddress(selectedChainId) || !address || isPending || isConfirming || isSwitchingBase || !expiry}
          >
            {isSwitchingBase ? `Switching to ${selectedNetwork.label}` : isPending || isConfirming ? 'Creating duel' : `Create duel on ${selectedNetwork.label}`}
          </button>
        </form>

        <aside className="duel-preview panel">
          <span className="eyebrow">Preview</span>
          <h2>Challenge card</h2>
          <p>{claim}</p>
          <div className="side-grid">
            <div className={`side-box ${side === 'YES' ? 'yes' : 'no'}`}>
              <small>Your side</small>
              <strong>{side}</strong>
            </div>
            <div className={`side-box ${oppositeSide(side) === 'YES' ? 'yes' : 'no'}`}>
              <small>Open side</small>
              <strong>{oppositeSide(side)}</strong>
            </div>
          </div>
          <label>
            <span>Stake locked</span>
            <strong>{stake || '0'} ETH</strong>
          </label>
          <label>
            <span>Evidence sources</span>
            <strong>{metadata.evidenceUrls.length}</strong>
          </label>
          <Link className="secondary-action full" to="/explore">View existing duels</Link>
        </aside>
      </div>
    </div>
  )
}
