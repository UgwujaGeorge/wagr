import { baseMainnet, baseSepolia } from '@wagr/shared'
import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
  chains: [baseSepolia, baseMainnet],
  connectors: [
    injected({ target: 'rabby' }),
    injected({ target: 'metaMask' }),
    injected({ target: 'coinbaseWallet' }),
    injected({ target: 'braveWallet' }),
    injected({ target: 'trustWallet' }),
    injected({ shimDisconnect: true }),
  ],
  transports: {
    [baseSepolia.id]: http(import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || import.meta.env.VITE_BASE_RPC_URL || baseSepolia.rpcUrls.default.http[0]),
    [baseMainnet.id]: http(import.meta.env.VITE_BASE_MAINNET_RPC_URL || baseMainnet.rpcUrls.default.http[0]),
  },
})
