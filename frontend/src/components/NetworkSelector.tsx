import { ChevronDown } from 'lucide-react'
import { useChainId } from 'wagmi'
import { useBaseNetwork } from '../lib/network'

export function NetworkSelector() {
  const walletChainId = useChainId()
  const { networks, selectedChainId, selectedNetwork, setSelectedChainId } = useBaseNetwork()
  const walletMatchesSelection = walletChainId === selectedChainId

  return (
    <label className={`network-selector ${selectedNetwork.isTestnet ? 'testnet' : 'mainnet'}`}>
      <span className="network-selector-copy">
        <small>{walletMatchesSelection ? 'Network' : 'Selected network'}</small>
        <strong>{selectedNetwork.label}</strong>
      </span>
      <span className={`network-mode-badge ${selectedNetwork.isTestnet ? 'testnet' : 'mainnet'}`}>
        {selectedNetwork.isTestnet ? 'Testnet' : 'Mainnet'}
      </span>
      <select
        aria-label="Select Base network"
        value={selectedChainId}
        onChange={(event) => setSelectedChainId(Number(event.target.value) as typeof selectedChainId)}
      >
        {networks.map((network) => (
          <option key={network.chainId} value={network.chainId}>
            {network.label}
          </option>
        ))}
      </select>
      <ChevronDown size={15} />
    </label>
  )
}
