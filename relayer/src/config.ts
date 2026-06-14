import './env.js'
import { baseChainNames, baseMainnet, baseSepolia, type BaseChainId } from '@wagr/shared'
import { isAddress } from 'viem'

export interface BaseNetworkConfig {
  chainId: BaseChainId
  name: string
  rpcUrl: string
  explorerUrl: string
  escrowAddress?: `0x${string}`
}

export interface RelayerConfig {
  port: number
  baseNetworks: Record<BaseChainId, BaseNetworkConfig>
  relayerPrivateKey?: `0x${string}`
  genlayerNetwork: string
  genlayerRpcUrl: string
  genlayerExplorerUrl: string
  genlayerResolverAddress?: `0x${string}`
}

function optionalAddress(name: string): `0x${string}` | undefined {
  const value = process.env[name]
  if (!value) return undefined
  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid EVM address`)
  }
  return value
}

function optionalPrivateKey(name: string): `0x${string}` | undefined {
  const value = process.env[name]
  if (!value) return undefined
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 32-byte 0x-prefixed private key`)
  }
  return value as `0x${string}`
}

export function loadConfig(): RelayerConfig {
  return {
    port: Number(process.env.PORT || process.env.RELAYER_PORT || 8787),
    baseNetworks: {
      [baseSepolia.id]: {
        chainId: baseSepolia.id,
        name: baseChainNames[baseSepolia.id],
        rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
        explorerUrl: process.env.BASE_SEPOLIA_EXPLORER_URL || 'https://sepolia.basescan.org',
        escrowAddress: optionalAddress('BASE_SEPOLIA_ESCROW_ADDRESS') || optionalAddress('BASE_ESCROW_ADDRESS'),
      },
      [baseMainnet.id]: {
        chainId: baseMainnet.id,
        name: baseChainNames[baseMainnet.id],
        rpcUrl: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
        explorerUrl: process.env.BASE_MAINNET_EXPLORER_URL || 'https://basescan.org',
        escrowAddress: optionalAddress('BASE_MAINNET_ESCROW_ADDRESS'),
      },
    },
    relayerPrivateKey: optionalPrivateKey('RELAYER_PRIVATE_KEY'),
    genlayerNetwork: process.env.GENLAYER_NETWORK || 'studionet',
    genlayerRpcUrl: process.env.GENLAYER_RPC_URL || 'https://studio.genlayer.com/api',
    genlayerExplorerUrl: process.env.GENLAYER_EXPLORER_URL || 'https://explorer-studio.genlayer.com',
    genlayerResolverAddress: optionalAddress('GENLAYER_RESOLVER_ADDRESS'),
  }
}
