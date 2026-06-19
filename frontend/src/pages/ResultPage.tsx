import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { VerdictPanel } from '../components/VerdictPanel'
import { oppositeSide } from '../lib/duels'
import { useLiveDuel } from '../lib/duelData'
import { useBaseNetwork } from '../lib/network'
import { getResolution } from '../lib/relayer'
import { describeUiError, logUiError } from '../lib/uiErrors'

export function ResultPage() {
  const { duelId } = useParams()
  const { selectedChainId, selectedNetwork } = useBaseNetwork()
  const { duel, error, isLoading } = useLiveDuel(selectedChainId, duelId)
  const resolutionQuery = useQuery({
    queryKey: ['resolution', selectedChainId, duelId],
    queryFn: () => getResolution(selectedChainId, duelId!),
    enabled: Boolean(duelId),
    retry: false,
  })

  useEffect(() => {
    if (error) {
      logUiError('Failed to load result duel data', error)
    }
  }, [error])

  useEffect(() => {
    if (resolutionQuery.error) {
      logUiError('Failed to load result resolution', resolutionQuery.error)
    }
  }, [resolutionQuery.error])

  if (isLoading && !duel) {
    return (
      <div className="page result-layout">
        <section className="panel result-summary">
          <span className="eyebrow">Resolution on {selectedNetwork.label}</span>
          <h1>Loading</h1>
          <p>Fetching duel results.</p>
        </section>
      </div>
    )
  }

  if (!duel) {
    return (
      <div className="page result-layout">
        <section className="panel result-summary">
          <span className="eyebrow">Resolution on {selectedNetwork.label}</span>
          <h1>Not found</h1>
          <p>{error ? describeUiError(error) : 'This duel is not available yet.'}</p>
          <Link className="secondary-action" to="/explore">
            Back to explore
          </Link>
        </section>
      </div>
    )
  }

  const verdict = resolutionQuery.data?.verdict?.verdict
  const winnerSide =
    verdict === 'YES' || verdict === 'NO'
      ? verdict === duel.creatorSide
        ? 'Creator'
        : 'Counterparty'
      : verdict === 'INVALID'
        ? 'Refundable'
        : 'Pending'
  const payoutState =
    verdict === 'YES' || verdict === 'NO'
      ? 'Winner can claim'
      : verdict === 'INVALID'
        ? 'Both sides refund'
        : 'Awaiting verdict'

  return (
    <div className="page result-layout">
      <section className={`panel result-summary verdict-shell verdict-${(verdict || 'pending').toLowerCase()}`}>
        <Trophy size={36} />
        <span className="eyebrow">Resolution on {selectedNetwork.label}</span>
        <h1>{verdict || 'Pending'}</h1>
        <p>{duel.claim}</p>
        {resolutionQuery.error && <p className="warning-text">{describeUiError(resolutionQuery.error)}</p>}
        <div className="result-grid">
          <span>
            <small>Creator side</small>
            <strong>{duel.creatorSide}</strong>
          </span>
          <span>
            <small>Counter side</small>
            <strong>{oppositeSide(duel.creatorSide)}</strong>
          </span>
          <span>
            <small>Pot</small>
            <strong>{duel.potEth} ETH</strong>
          </span>
          <span>
            <small>Winner</small>
            <strong>{verdict ? winnerSide : 'Pending'}</strong>
          </span>
          <span>
            <small>Payout state</small>
            <strong>{payoutState}</strong>
          </span>
        </div>
        <Link className="secondary-action" to={`/duels/${duel.id}`}>
          Back to duel
        </Link>
      </section>
      <VerdictPanel verdict={resolutionQuery.data?.verdict} />
    </div>
  )
}
