import { Link } from 'react-router-dom'
import { Clock, ExternalLink, ShieldCheck } from 'lucide-react'
import { formatCountdown, oppositeSide, statusTone, type Duel } from '../lib/duels'

export function DuelCard({ duel }: { duel: Duel }) {
  return (
    <article className="duel-card">
      <div className="duel-card-top">
        <span className="category-pill">{duel.category}</span>
        <span className={`status-pill ${statusTone(duel.status)}`}>{duel.status}</span>
      </div>

      <h3>{duel.claim}</h3>
      <p>{duel.resolutionRules}</p>

      <div className="side-grid">
        <div className={`side-box ${duel.creatorSide === 'YES' ? 'yes' : 'no'}`}>
          <small>Creator stands</small>
          <strong>{duel.creatorSide}</strong>
        </div>
        <div className={`side-box ${oppositeSide(duel.creatorSide) === 'YES' ? 'yes' : 'no'}`}>
          <small>{duel.counterparty ? 'Counter stands' : 'Open side'}</small>
          <strong>{oppositeSide(duel.creatorSide)}</strong>
        </div>
      </div>

      <div className="duel-metrics">
        <span>
          <small>Stake</small>
          <strong>{duel.stakeEth} ETH</strong>
        </span>
        <span>
          <small>Pot</small>
          <strong>{duel.potEth} ETH</strong>
        </span>
        <span>
          <small>Expiry</small>
          <strong>
            <Clock size={14} /> {formatCountdown(duel.expiry)}
          </strong>
        </span>
      </div>

      <div className="duel-card-footer">
        <span>
          <ShieldCheck size={14} /> {duel.verdict ? `${duel.verdict.verdict} verdict` : 'GenLayer pending'}
        </span>
        <Link className="card-link" to={`/duels/${duel.id}`}>
          Inspect <ExternalLink size={14} />
        </Link>
      </div>
    </article>
  )
}
