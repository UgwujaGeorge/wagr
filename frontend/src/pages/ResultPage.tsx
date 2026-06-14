import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { VerdictPanel } from '../components/VerdictPanel'
import { demoDuels, oppositeSide } from '../lib/duels'
import { useBaseNetwork } from '../lib/network'
import { getDuelMetadata, getResolution } from '../lib/relayer'

export function ResultPage() {
  const { duelId } = useParams()
  const { selectedChainId, selectedNetwork } = useBaseNetwork()
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
  const demoDuel = demoDuels.find((item) => item.id === duelId) || demoDuels[2]
  const duel = metadataQuery.data
    ? {
        ...demoDuel,
        id: metadataQuery.data.duelId,
        claim: metadataQuery.data.claim,
        creatorSide: metadataQuery.data.creatorSide,
        resolutionRules: metadataQuery.data.resolutionRules,
        evidenceUrls: metadataQuery.data.evidenceUrls,
        verdict: resolutionQuery.data?.verdict,
      }
    : demoDuel
  const verdict = duel.verdict?.verdict
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
            <strong>{duel.verdict ? winnerSide : 'Pending'}</strong>
          </span>
          <span>
            <small>Payout state</small>
            <strong>{payoutState}</strong>
          </span>
        </div>
        <Link className="secondary-action" to={`/duels/${duel.id}`}>Back to duel</Link>
      </section>
      <VerdictPanel verdict={duel.verdict} />
    </div>
  )
}
