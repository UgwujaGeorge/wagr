import { useEffect } from 'react'
import { DuelCard } from '../components/DuelCard'
import { useBaseNetwork } from '../lib/network'
import { useLiveDuelInventory } from '../lib/duelData'
import { describeUiError, logUiError } from '../lib/uiErrors'

export function ExplorePage() {
  const { selectedChainId, selectedNetwork } = useBaseNetwork()
  const { items, error, isLoading } = useLiveDuelInventory(selectedChainId)
  const duels = items
    .slice()
    .sort((left, right) => Number(right.duel.id) - Number(left.duel.id))

  useEffect(() => {
    if (error) {
      logUiError('Failed to load explore inventory', error)
    }
  }, [error])

  return (
    <div className="page explore-page">
      <section className="page-heading">
        <span className="eyebrow">The arena</span>
        <h1>Choose a claim worth fighting for.</h1>
        <p>Browse the live marketplace inventory on {selectedNetwork.label} where each duel is sourced from the relayer and onchain state.</p>
        {!selectedNetwork.isTestnet && <p className="warning-text">You are using Base Mainnet. Real funds may be involved.</p>}
        {error && <p className="warning-text">{describeUiError(error)}</p>}
      </section>

      {isLoading && duels.length === 0 ? (
        <div className="empty-state panel">
          <h3>Loading duels</h3>
          <p>Fetching the live marketplace inventory.</p>
        </div>
      ) : duels.length > 0 ? (
        <div className="duel-grid">
          {duels.map(({ duel }) => <DuelCard key={duel.id} duel={duel} />)}
        </div>
      ) : (
        <div className="empty-state panel">
          <h3>No duels available yet</h3>
          <p>Newly created duels will appear here once they are saved to the relayer.</p>
        </div>
      )}
    </div>
  )
}
