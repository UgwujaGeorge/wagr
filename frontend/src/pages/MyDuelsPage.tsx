import { useAccount } from 'wagmi'
import { DuelCard } from '../components/DuelCard'
import { demoDuels } from '../lib/duels'
import { useBaseNetwork } from '../lib/network'

export function MyDuelsPage() {
  const { address } = useAccount()
  const { selectedNetwork } = useBaseNetwork()

  return (
    <div className="page my-duels-page">
      <section className="page-heading">
        <span className="eyebrow">Your ledger</span>
        <h1>Duels under your banner.</h1>
        <p>
          {address
            ? `Track your ${selectedNetwork.label} challenges, accepted wagers, verdicts, and claimable outcomes.`
            : `Connect a wallet to reveal the duels tied to your address on ${selectedNetwork.label}.`}
        </p>
        {!selectedNetwork.isTestnet && <p className="warning-text">You are using Base Mainnet. Real funds may be involved.</p>}
      </section>

      <div className="filter-row">
        <button className="active">Created</button>
        <button>Accepted</button>
        <button>Action needed</button>
        <button>Won</button>
        <button>Refundable</button>
      </div>

      <div className="duel-grid">
        {demoDuels.slice(0, 2).map((duel) => <DuelCard key={duel.id} duel={duel} />)}
      </div>
    </div>
  )
}
