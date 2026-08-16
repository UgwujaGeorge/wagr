import {
  canonicalizeAuthenticatedDuelData,
  getBaseChain,
  isSupportedBaseChainId,
  type AuthenticatedDuelData,
  type BaseChainId,
  type DuelSide,
  type DuelStatus,
  wagrDuelEscrowAbi,
  WAGR_DATA_SUFFIX,
} from '@wagr/shared'
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
  metadataHash: `0x${string}`,
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
  return contract.write.submitVerdict([duelId, baseVerdictEnum[verdict], confidenceBps, metadataHash, hash])
}

const sideNames: Array<DuelSide | 'None'> = ['None', 'YES', 'NO']
const statusNames: Array<DuelStatus | 'None'> = [
  'None',
  'Open',
  'Active',
  'ResolutionRequested',
  'Resolved',
  'Invalid',
  'Canceled',
  'Paid',
]

export async function readDuelFromBase(
  config: RelayerConfig,
  chainId: BaseChainId,
  duelId: bigint,
): Promise<AuthenticatedDuelData> {
  const network = getNetworkConfig(config, chainId)
  if (!network.escrowAddress) {
    throw new Error(`${network.name} escrow address is required to authenticate duel state`)
  }

  const { publicClient } = createBaseClients(config, chainId)
  const raw = await publicClient.readContract({
    address: network.escrowAddress,
    abi: wagrDuelEscrowAbi,
    functionName: 'duels',
    args: [duelId],
  })

  const creator = getField<string>(raw, 'creator', 0)
  const counterparty = getField<string>(raw, 'counterparty', 1)
  const creatorSide = sideNames[Number(getField<bigint | number>(raw, 'creatorSide', 2))]
  const stakeAmount = getField<bigint>(raw, 'stakeAmount', 3)
  const expiry = getField<bigint>(raw, 'expiry', 4)
  const metadataHash = getField<`0x${string}`>(raw, 'metadataHash', 5)
  const status = statusNames[Number(getField<bigint | number>(raw, 'status', 6))]

  if (
    !creator ||
    !counterparty ||
    !metadataHash ||
    (creatorSide !== 'YES' && creatorSide !== 'NO') ||
    !isDuelStatus(status)
  ) {
    throw new Error(`Base duel ${duelId.toString()} does not exist`)
  }

  return canonicalizeAuthenticatedDuelData({
    chainId,
    duelId: duelId.toString(),
    creator,
    counterparty,
    creatorSide,
    counterpartySide: creatorSide === 'YES' ? 'NO' : 'YES',
    stakeAmountWei: String(stakeAmount),
    expiry: String(expiry),
    status,
    metadataHash,
  })
}

function getField<T>(value: unknown, key: string, index: number): T {
  const objectValue = value as Record<string, unknown>
  const arrayValue = value as readonly unknown[]
  return (objectValue[key] ?? arrayValue[index]) as T
}

function isDuelStatus(value: unknown): value is DuelStatus {
  return (
    value === 'Open' ||
    value === 'Active' ||
    value === 'ResolutionRequested' ||
    value === 'Resolved' ||
    value === 'Invalid' ||
    value === 'Canceled' ||
    value === 'Paid'
  )
}
