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
  /** Pays gas for `submitVerdict`. Carries no authority of its own. */
  relayerPrivateKey?: `0x${string}`
  /** This process's attester identity, if it is also acting as an attester. */
  attesterPrivateKey?: `0x${string}`
  /** Independent attester services asked to co-sign each verdict. */
  attesterEndpoints: string[]
  /** Shared secret required by this process's own `/attest` endpoint. */
  attesterAuthToken?: string
  genlayerNetwork: string
  genlayerRpcUrl: string
  genlayerExplorerUrl: string
  genlayerResolverAddress?: `0x${string}`
  /** Require GenLayer FINALIZED rather than merely ACCEPTED before attesting. */
  requireGenlayerFinality: boolean
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
    attesterPrivateKey: optionalPrivateKey('WAGR_ATTESTER_PRIVATE_KEY'),
    attesterEndpoints: (process.env.WAGR_ATTESTER_ENDPOINTS || '')
      .split(',')
      .map((endpoint) => endpoint.trim())
      .filter(Boolean),
    attesterAuthToken: process.env.WAGR_ATTESTER_AUTH_TOKEN || undefined,
    requireGenlayerFinality: process.env.WAGR_REQUIRE_GENLAYER_FINALITY !== 'false',
    genlayerNetwork: process.env.GENLAYER_NETWORK || 'studionet',
    genlayerRpcUrl: process.env.GENLAYER_RPC_URL || 'https://studio.genlayer.com/api',
    genlayerExplorerUrl: process.env.GENLAYER_EXPLORER_URL || 'https://explorer-studio.genlayer.com',
    genlayerResolverAddress: optionalAddress('GENLAYER_RESOLVER_ADDRESS'),
  }
}
