import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DuelCard } from '../components/DuelCard'
import { demoDuels, type Duel } from '../lib/duels'
import { useBaseNetwork } from '../lib/network'
import { listDuelMetadata } from '../lib/relayer'

type DuelFilter = 'All' | 'Open' | 'Active' | 'Expired' | 'Resolved'

const duelFilters: DuelFilter[] = ['All', 'Open', 'Active', 'Expired', 'Resolved']

export function ExplorePage() {
  const [activeFilter, setActiveFilter] = useState<DuelFilter>('All')
  const { selectedChainId, selectedNetwork } = useBaseNetwork()
  const metadataQuery = useQuery({
    queryKey: ['metadata-list', selectedChainId],
    queryFn: () => listDuelMetadata(selectedChainId),
    retry: false,
  })
  const relayerDuels: Duel[] = (metadataQuery.data?.items || []).map((item) => ({
    id: item.duelId,
    claim: item.claim,
    category: item.category || 'Public evidence',
    creator: 'Onchain creator',
    creatorSide: item.creatorSide,
    stakeEth: '0',
    potEth: '0',
    expiry: item.expiryTime,
    status: 'Open',
    evidenceUrls: item.evidenceUrls,
    resolutionRules: item.resolutionRules,
  }))
  const duels = relayerDuels.length > 0 ? relayerDuels : demoDuels
  const filteredDuels = useMemo(() => {
    if (activeFilter === 'All') return duels
    if (activeFilter === 'Expired') {
      return duels.filter((duel) => new Date(duel.expiry).getTime() <= Date.now() && duel.status !== 'Resolved')
    }
    return duels.filter((duel) => duel.status === activeFilter)
  }, [activeFilter, duels])

  return (
    <div className="page explore-page">
      <section className="page-heading">
        <span className="eyebrow">The arena</span>
        <h1>Choose a claim worth fighting for.</h1>
        <p>Browse open and active one-on-one duels on {selectedNetwork.label} where the outcome depends on public evidence, not market depth.</p>
        {!selectedNetwork.isTestnet && <p className="warning-text">You are using Base Mainnet. Real funds may be involved.</p>}
      </section>

      <div className="filter-row">
        {duelFilters.map((filter) => (
          <button
            key={filter}
            className={activeFilter === filter ? 'active' : undefined}
            type="button"
            aria-pressed={activeFilter === filter}
            onClick={() => setActiveFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="duel-grid">
        {filteredDuels.map((duel) => <DuelCard key={duel.id} duel={duel} />)}
      </div>
    </div>
  )
}
