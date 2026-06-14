import { baseChainNames, baseMainnet, baseSepolia, isSupportedBaseChainId, type BaseChainId } from '@wagr/shared'
import { isAddress, type Hash } from 'viem'

export const relayerUrl = import.meta.env.VITE_RELAYER_URL || 'http://localhost:8787'

export interface FrontendBaseNetwork {
  chain: typeof baseSepolia | typeof baseMainnet
  chainId: BaseChainId
  envKey: string
  explorerUrl: string
  isTestnet: boolean
  label: string
  rpcUrl: string
  slug: 'baseSepolia' | 'baseMainnet'
}

export const frontendBaseNetworks: FrontendBaseNetwork[] = [
  {
    chain: baseSepolia,
    chainId: baseSepolia.id,
    envKey: 'VITE_BASE_SEPOLIA_ESCROW_ADDRESS',
    explorerUrl: 'https://sepolia.basescan.org',
    isTestnet: true,
    label: 'Base Sepolia',
    rpcUrl: import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || import.meta.env.VITE_BASE_RPC_URL || baseSepolia.rpcUrls.default.http[0],
    slug: 'baseSepolia',
  },
  {
    chain: baseMainnet,
    chainId: baseMainnet.id,
    envKey: 'VITE_BASE_MAINNET_ESCROW_ADDRESS',
    explorerUrl: 'https://basescan.org',
    isTestnet: false,
    label: 'Base Mainnet',
    rpcUrl: import.meta.env.VITE_BASE_MAINNET_RPC_URL || baseMainnet.rpcUrls.default.http[0],
    slug: 'baseMainnet',
  },
]

const networksByChainId = new Map(frontendBaseNetworks.map((network) => [network.chainId, network]))

export function getDefaultBaseChainId(): BaseChainId {
  return import.meta.env.VITE_DEFAULT_CHAIN === 'baseMainnet' ? baseMainnet.id : baseSepolia.id
}

export function getFrontendBaseNetwork(chainId: number | undefined): FrontendBaseNetwork {
  return networksByChainId.get(isSupportedBaseChainId(Number(chainId)) ? Number(chainId) as BaseChainId : getDefaultBaseChainId())!
}

export function getEscrowAddress(chainId: BaseChainId): `0x${string}` | undefined {
  const value =
    chainId === baseSepolia.id
      ? import.meta.env.VITE_BASE_SEPOLIA_ESCROW_ADDRESS || import.meta.env.VITE_WAGR_ESCROW_ADDRESS
      : import.meta.env.VITE_BASE_MAINNET_ESCROW_ADDRESS
  return value && isAddress(value) ? value : undefined
}

export function hasEscrowAddress(chainId: BaseChainId): boolean {
  return Boolean(getEscrowAddress(chainId))
}

export function getBaseTxUrl(chainId: BaseChainId, hash: Hash): string {
  return `${getFrontendBaseNetwork(chainId).explorerUrl.replace(/\/$/, '')}/tx/${hash}`
}

export function getBaseAddressUrl(chainId: BaseChainId, address: `0x${string}`): string {
  return `${getFrontendBaseNetwork(chainId).explorerUrl.replace(/\/$/, '')}/address/${address}`
}

export function getBaseChainName(chainId: BaseChainId): string {
  return baseChainNames[chainId]
}
