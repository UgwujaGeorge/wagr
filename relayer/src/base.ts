import { getBaseChain, isSupportedBaseChainId, type BaseChainId, wagrDuelEscrowAbi, WAGR_DATA_SUFFIX } from '@wagr/shared'
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
  keccak256,
  stringToHex,
  type Hash,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { RelayerConfig } from './config.js'

export const baseVerdictEnum = {
  YES: 1,
  NO: 2,
  INVALID: 3,
} as const

export function verdictHash(verdict: unknown): `0x${string}` {
  return keccak256(stringToHex(JSON.stringify(verdict)))
}

function getNetworkConfig(config: RelayerConfig, chainId: BaseChainId) {
  if (!isSupportedBaseChainId(chainId)) {
    throw new Error(`Unsupported Base chain ID: ${chainId}`)
  }
  return config.baseNetworks[chainId]
}

export function createBaseClients(config: RelayerConfig, chainId: BaseChainId) {
  const network = getNetworkConfig(config, chainId)
  const chain = getBaseChain(chainId)
  const publicClient = createPublicClient({
    chain,
    transport: http(network.rpcUrl),
  })

  const walletClient = config.relayerPrivateKey
    ? createWalletClient({
        account: privateKeyToAccount(config.relayerPrivateKey),
        chain,
        dataSuffix: WAGR_DATA_SUFFIX,
        transport: http(network.rpcUrl),
      })
    : undefined

  return { publicClient, walletClient }
}

export async function submitVerdictToBase(
  config: RelayerConfig,
  chainId: BaseChainId,
  duelId: bigint,
  verdict: keyof typeof baseVerdictEnum,
  confidence: number,
  hash: `0x${string}`,
): Promise<Hash> {
  const network = getNetworkConfig(config, chainId)
  if (!network.escrowAddress) {
    throw new Error(`${network.name} escrow address is required to submit a verdict`)
  }
  const { publicClient, walletClient } = createBaseClients(config, chainId)
  if (!walletClient?.account) {
    throw new Error('RELAYER_PRIVATE_KEY is required to submit a verdict')
  }

  const contract = getContract({
    address: network.escrowAddress,
    abi: wagrDuelEscrowAbi,
    client: { public: publicClient, wallet: walletClient },
  })

  const confidenceBps = Math.max(0, Math.min(10000, Math.round(confidence * 100)))
  return contract.write.submitVerdict([duelId, baseVerdictEnum[verdict], confidenceBps, hash])
}
