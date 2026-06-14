import { Check, ChevronDown, Wallet, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { useBaseNetwork } from '../lib/network'

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const walletLabels: Record<string, string> = {
  rabby: 'Rabby',
  metaMask: 'MetaMask',
  coinbaseWallet: 'Coinbase Wallet',
  braveWallet: 'Brave Wallet',
  trustWallet: 'Trust Wallet',
  phantom: 'Phantom',
  injected: 'Browser Wallet',
}

const walletFallbacks: Record<string, string> = {
  rabby: 'R',
  metaMask: 'M',
  coinbaseWallet: 'C',
  braveWallet: 'B',
  trustWallet: 'T',
  phantom: 'P',
  injected: '...',
}

const walletOrder = ['rabby', 'metaMask', 'coinbaseWallet', 'braveWallet', 'trustWallet', 'phantom', 'injected']

function walletKey(connector: { id: string; name: string }) {
  const value = `${connector.id} ${connector.name}`.toLowerCase()
  if (value.includes('rabby')) return 'rabby'
  if (value.includes('metamask') || value.includes('meta mask')) return 'metaMask'
  if (value.includes('coinbase')) return 'coinbaseWallet'
  if (value.includes('brave')) return 'braveWallet'
  if (value.includes('trust')) return 'trustWallet'
  if (value.includes('phantom')) return 'phantom'
  if (value.includes('injected') || value.includes('browser')) return 'injected'
  return connector.id
}

export function WalletButton() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { selectedChainId, selectedNetwork } = useBaseNetwork()
  const { connect, connectors, error, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [isOpen, setIsOpen] = useState(false)
  const [available, setAvailable] = useState<Record<string, boolean>>({})
  const [pendingConnectorUid, setPendingConnectorUid] = useState<string>()

  useEffect(() => {
    let active = true

    async function detectWallets() {
      const entries = await Promise.all(
        connectors.map(async (connector) => {
          try {
            const provider = await connector.getProvider()
            return [connector.uid, Boolean(provider)] as const
          } catch {
            return [connector.uid, false] as const
          }
        }),
      )

      if (active) {
        setAvailable(Object.fromEntries(entries))
      }
    }

    detectWallets()
    return () => {
      active = false
    }
  }, [connectors])

  useEffect(() => {
    if (!isPending) {
      setPendingConnectorUid(undefined)
    }
  }, [isPending])

  const walletOptions = useMemo(
    () => {
      const optionsByKey = new Map<
        string,
        {
          connector: (typeof connectors)[number]
          icon?: string
          isAvailable: boolean
          key: string
          label: string
        }
      >()

      for (const connector of connectors) {
        const key = walletKey(connector)
        const option = {
          connector,
          icon: connector.icon,
          isAvailable: available[connector.uid] ?? false,
          key,
          label: walletLabels[key] || connector.name,
        }
        const current = optionsByKey.get(key)
        const currentScore = current ? Number(current.isAvailable) * 10 + Number(Boolean(current.icon)) : -1
        const optionScore = Number(option.isAvailable) * 10 + Number(Boolean(option.icon))

        if (!current || optionScore > currentScore) {
          optionsByKey.set(key, option)
        }
      }

      return [...optionsByKey.values()].sort((a, b) => {
        const aIndex = walletOrder.indexOf(a.key)
        const bIndex = walletOrder.indexOf(b.key)
        return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex)
      })
    },
    [available, connectors],
  )

  function connectWallet(connector: (typeof connectors)[number]) {
    setPendingConnectorUid(connector.uid)
    connect({ connector, chainId: selectedChainId })
    setIsOpen(false)
  }

  if (!isConnected) {
    return (
      <div className="wallet-menu">
        <button className="wallet-button" disabled={isPending} onClick={() => setIsOpen((value) => !value)} aria-expanded={isOpen}>
          <Wallet size={16} />
          {isPending ? 'Connecting' : 'Connect'}
          <ChevronDown size={15} />
        </button>

        {isOpen && (
          <div className="wallet-popover">
            <div className="wallet-grid">
              {walletOptions.map(({ connector, icon, isAvailable, key, label }) => (
                <button
                  key={connector.uid}
                  aria-label={`${label}${isAvailable ? '' : ' not detected'}`}
                  className={`wallet-tile ${isAvailable ? '' : 'unavailable'}`}
                  disabled={!isAvailable || isPending}
                  onClick={() => connectWallet(connector)}
                  title={`${label}${isAvailable ? '' : ' not detected'}`}
                >
                  {icon ? (
                    <img src={icon} alt="" />
                  ) : (
                    <span className={`wallet-fallback wallet-fallback-${key}`}>{walletFallbacks[key] || label.slice(0, 1)}</span>
                  )}
                  {pendingConnectorUid === connector.uid && isPending ? (
                    <span className="wallet-pending">
                      <Check size={14} />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {error ? <p>{error.message}</p> : null}
          </div>
        )}
      </div>
    )
  }

  if (chainId !== selectedChainId) {
    return (
      <button className="wallet-button danger" disabled={isSwitching} onClick={() => switchChain({ chainId: selectedChainId })}>
        <WifiOff size={16} />
        {isSwitching ? 'Switching' : `Switch to ${selectedNetwork.label}`}
      </button>
    )
  }

  return (
    <button className="wallet-button connected" onClick={() => disconnect()}>
      <Wallet size={16} />
      {address ? shortAddress(address) : 'Connected'}
    </button>
  )
}
