import { defineChain } from 'viem'

export const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://sepolia.base.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'BaseScan',
      url: 'https://sepolia.basescan.org',
    },
  },
  testnet: true,
})

export const baseMainnet = defineChain({
  id: 8453,
  name: 'Base',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://mainnet.base.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'BaseScan',
      url: 'https://basescan.org',
    },
  },
})

export const baseChainIds = [baseSepolia.id, baseMainnet.id] as const
export type BaseChainId = (typeof baseChainIds)[number]

export const baseChains = {
  [baseSepolia.id]: baseSepolia,
  [baseMainnet.id]: baseMainnet,
} as const

export const baseChainNames = {
  [baseSepolia.id]: 'Base Sepolia',
  [baseMainnet.id]: 'Base Mainnet',
} as const

export const baseChainSlugs = {
  [baseSepolia.id]: 'baseSepolia',
  [baseMainnet.id]: 'baseMainnet',
} as const

export function isSupportedBaseChainId(chainId: number): chainId is BaseChainId {
  return baseChainIds.includes(chainId as BaseChainId)
}

export function getBaseChain(chainId: BaseChainId) {
  return baseChains[chainId]
}

export const genlayerStudioNet = {
  chainId: 61999,
  name: 'GenLayer StudioNet',
  rpcUrl: 'https://studio.genlayer.com/api',
  websocketUrl: 'wss://studio.genlayer.com',
} as const

export const WAGR_TAGLINE = 'PvP prediction battles resolved by GenLayer.'
