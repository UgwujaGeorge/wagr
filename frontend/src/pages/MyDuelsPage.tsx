import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { DuelCard } from '../components/DuelCard'
import { canClaimPayout, canClaimRefund, canTakeAction, getWinnerAddress, sameAddress, useLiveDuelInventory } from '../lib/duelData'
import { useBaseNetwork } from '../lib/network'
import { describeUiError, logUiError } from '../lib/uiErrors'

type DuelTab = 'Created' | 'Accepted' | 'Action Needed' | 'Won' | 'Refundable'

const duelTabs: DuelTab[] = ['Created', 'Accepted', 'Action Needed', 'Won', 'Refundable']

export function MyDuelsPage() {
  const { address } = useAccount()
  const { selectedChainId, selectedNetwork } = useBaseNetwork()
  const { items, isLoading, error } = useLiveDuelInventory(selectedChainId)
  const [activeTab, setActiveTab] = useState<DuelTab>('Created')
  const walletAddress = address?.toLowerCase()

  useEffect(() => {
    if (error) {
      logUiError('Failed to load My Duels inventory', error)
    }
  }, [error])

  const duels = useMemo(() => {
    if (!address) return []

    const filtered = items.filter(({ chain }) => {
      switch (activeTab) {
        case 'Created':
          return sameAddress(chain?.creator, walletAddress)
        case 'Accepted':
          return sameAddress(chain?.counterparty, walletAddress)
        case 'Action Needed':
          return canTakeAction(chain, walletAddress)
        case 'Won':
          return Boolean(canClaimPayout(chain, walletAddress) || (chain?.status === 'Paid' && sameAddress(getWinnerAddress(chain), walletAddress)))
        case 'Refundable':
          return canClaimRefund(chain, walletAddress)
      }
    })

    return filtered.sort((left, right) => Number(right.duel.id) - Number(left.duel.id))
  }, [address, activeTab, items, walletAddress])

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
        {error && <p className="warning-text">{describeUiError(error)}</p>}
      </section>

      <div className="filter-row">
        {duelTabs.map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? 'active' : undefined}
            type="button"
            aria-pressed={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {!address ? (
        <div className="empty-state panel">
          <h3>Connect a wallet</h3>
          <p>My Duels is wallet-scoped. Connect the address that created or joined the duel to see your activity.</p>
        </div>
      ) : isLoading && duels.length === 0 ? (
        <div className="empty-state panel">
          <h3>Loading your duels</h3>
          <p>Fetching the live duel list for this wallet.</p>
        </div>
      ) : duels.length > 0 ? (
        <div className="duel-grid">
          {duels.map(({ duel }) => <DuelCard key={duel.id} duel={duel} />)}
        </div>
      ) : (
        <div className="empty-state panel">
          <h3>No duels found for this wallet.</h3>
          <p>Try another tab or connect a different wallet if you expected to see duels here.</p>
        </div>
      )}
    </div>
  )
}
