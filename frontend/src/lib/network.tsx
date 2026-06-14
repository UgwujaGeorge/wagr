import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { isSupportedBaseChainId, type BaseChainId } from '@wagr/shared'
import { frontendBaseNetworks, getDefaultBaseChainId, getFrontendBaseNetwork, type FrontendBaseNetwork } from './contracts'

const storageKey = 'wagr:selectedBaseChainId'

interface BaseNetworkContextValue {
  selectedChainId: BaseChainId
  selectedNetwork: FrontendBaseNetwork
  setSelectedChainId(chainId: BaseChainId): void
  networks: FrontendBaseNetwork[]
}

const BaseNetworkContext = createContext<BaseNetworkContextValue | undefined>(undefined)

function initialChainId(): BaseChainId {
  if (typeof window === 'undefined') return getDefaultBaseChainId()
  const stored = Number(window.localStorage.getItem(storageKey))
  return isSupportedBaseChainId(stored) ? stored : getDefaultBaseChainId()
}

export function BaseNetworkProvider({ children }: { children: ReactNode }) {
  const [selectedChainId, setSelectedChainIdState] = useState<BaseChainId>(initialChainId)
  const value = useMemo<BaseNetworkContextValue>(
    () => ({
      selectedChainId,
      selectedNetwork: getFrontendBaseNetwork(selectedChainId),
      setSelectedChainId(chainId) {
        if (!isSupportedBaseChainId(chainId)) return
        setSelectedChainIdState(chainId)
        window.localStorage.setItem(storageKey, String(chainId))
      },
      networks: frontendBaseNetworks,
    }),
    [selectedChainId],
  )

  return <BaseNetworkContext.Provider value={value}>{children}</BaseNetworkContext.Provider>
}

export function useBaseNetwork() {
  const value = useContext(BaseNetworkContext)
  if (!value) {
    throw new Error('useBaseNetwork must be used inside BaseNetworkProvider')
  }
  return value
}
