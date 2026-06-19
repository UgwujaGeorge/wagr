import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { wagrDuelEscrowAbi, type BaseChainId, type DuelSide, type DuelStatus } from '@wagr/shared'
import { formatEther, zeroAddress } from 'viem'
import { usePublicClient } from 'wagmi'
import { getEscrowAddress } from './contracts'
import { type Duel } from './duels'
import { getDuelMetadata, listDuelMetadata, type StoredDuelMetadata } from './relayer'

type VerdictName = 'None' | 'YES' | 'NO' | 'INVALID'
const duelStatusNames = ['None', 'Open', 'Active', 'ResolutionRequested', 'Resolved', 'Invalid', 'Canceled', 'Paid'] as const
const verdictNames = ['None', 'YES', 'NO', 'INVALID'] as const

export interface ChainDuelRecord {
  creator: string
  counterparty?: string
  creatorSide: DuelSide
  stakeAmount: bigint
  expiry: bigint
  status: DuelStatus | 'None'
  verdict: VerdictName
  creatorClaimed: boolean
  counterpartyClaimed: boolean
}

export interface LiveDuelRecord {
  metadata: StoredDuelMetadata
  chain?: ChainDuelRecord
  duel: Duel
}

export function sameAddress(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase())
}

export function isParticipant(chain: ChainDuelRecord | undefined, address: string | undefined): boolean {
  return sameAddress(chain?.creator, address) || sameAddress(chain?.counterparty, address)
}

export function getWinnerAddress(chain: ChainDuelRecord | undefined): string | undefined {
  if (!chain || (chain.verdict !== 'YES' && chain.verdict !== 'NO')) return undefined
  return chain.creatorSide === chain.verdict ? chain.creator : chain.counterparty
}

export function canClaimRefund(chain: ChainDuelRecord | undefined, address: string | undefined): boolean {
  if (!chain || chain.status !== 'Invalid' || !isParticipant(chain, address)) return false
  if (sameAddress(chain.creator, address)) return !chain.creatorClaimed
  if (sameAddress(chain.counterparty, address)) return !chain.counterpartyClaimed
  return false
}

export function canClaimPayout(chain: ChainDuelRecord | undefined, address: string | undefined): boolean {
  if (!chain || chain.status !== 'Resolved') return false
  return sameAddress(getWinnerAddress(chain), address) && !chain.creatorClaimed && !chain.counterpartyClaimed
}

export function canTakeAction(chain: ChainDuelRecord | undefined, address: string | undefined): boolean {
  if (!chain) return false
  if (chain.status === 'Open') return sameAddress(chain.creator, address)
  if ((chain.status === 'Active' || chain.status === 'ResolutionRequested') && chain.expiry * 1000n <= BigInt(Date.now())) {
    return isParticipant(chain, address)
  }
  return false
}

export function buildDuelCard(metadata: StoredDuelMetadata, chain?: ChainDuelRecord): Duel {
  const expiry = chain?.expiry ? new Date(Number(chain.expiry) * 1000).toISOString() : metadata.expiryTime
  const status = chain?.status && chain.status !== 'None' ? chain.status : 'Open'
  return {
    id: metadata.duelId,
    claim: metadata.claim,
    category: metadata.category || 'Public evidence',
    creator: chain?.creator && chain.creator !== zeroAddress ? shortenAddress(chain.creator) : 'Onchain creator',
    counterparty: chain?.counterparty && chain.counterparty !== zeroAddress ? shortenAddress(chain.counterparty) : undefined,
    creatorSide: chain?.creatorSide || metadata.creatorSide,
    stakeEth: chain ? formatEther(chain.stakeAmount) : '0',
    potEth: chain ? formatEther(chain.stakeAmount * 2n) : '0',
    expiry,
    status,
    evidenceUrls: metadata.evidenceUrls,
    resolutionRules: metadata.resolutionRules,
    verdict: undefined,
  }
}

export function useLiveDuelInventory(chainId: BaseChainId) {
  const publicClient = usePublicClient({ chainId })
  const metadataQuery = useQuery({
    queryKey: ['metadata-list', chainId],
    queryFn: () => listDuelMetadata(chainId),
    retry: false,
  })
  const contractAddress = getEscrowAddress(chainId)
  const duelQueries = useQueries({
    queries:
      metadataQuery.data?.items.map((item) => ({
        queryKey: ['duel-onchain', chainId, item.duelId],
        queryFn: async () => {
          if (!publicClient || !contractAddress) return undefined
          const raw = await publicClient.readContract({
            address: contractAddress,
            abi: wagrDuelEscrowAbi,
            functionName: 'duels',
            args: [BigInt(item.duelId)],
          })
          return normalizeChainDuel(raw)
        },
        enabled: Boolean(publicClient && contractAddress),
        retry: false,
      })) || [],
  })

  const items = useMemo<LiveDuelRecord[]>(
    () =>
      (metadataQuery.data?.items || []).map((metadata, index) => ({
        metadata,
        chain: duelQueries[index]?.data,
        duel: buildDuelCard(metadata, duelQueries[index]?.data),
      })),
    [duelQueries, metadataQuery.data?.items],
  )

  return {
    error: metadataQuery.error || duelQueries.find((query) => query.error)?.error,
    isLoading: metadataQuery.isLoading,
    isFetching: metadataQuery.isFetching || duelQueries.some((query) => query.isFetching),
    items,
    refetch: metadataQuery.refetch,
  }
}

export function useLiveDuel(chainId: BaseChainId, duelId: string | undefined) {
  const publicClient = usePublicClient({ chainId })
  const metadataQuery = useQuery({
    queryKey: ['metadata', chainId, duelId],
    queryFn: () => getDuelMetadata(chainId, duelId!),
    enabled: Boolean(duelId),
    retry: false,
  })
  const contractAddress = getEscrowAddress(chainId)
  const chainQuery = useQuery({
    queryKey: ['duel-onchain', chainId, duelId],
    queryFn: async () => {
      if (!publicClient || !contractAddress || !duelId) return undefined
      const raw = await publicClient.readContract({
        address: contractAddress,
        abi: wagrDuelEscrowAbi,
        functionName: 'duels',
        args: [BigInt(duelId)],
      })
      return normalizeChainDuel(raw)
    },
    enabled: Boolean(publicClient && contractAddress && duelId),
    retry: false,
  })

  const duel = useMemo(() => {
    if (!metadataQuery.data) return undefined
    return buildDuelCard(metadataQuery.data, chainQuery.data)
  }, [chainQuery.data, metadataQuery.data])

  return {
    chain: chainQuery.data,
    error: metadataQuery.error || chainQuery.error,
    isChainFetching: chainQuery.isFetching,
    isChainLoading: chainQuery.isLoading,
    isLoading: metadataQuery.isLoading || chainQuery.isLoading,
    duel,
    metadata: metadataQuery.data,
  }
}

function normalizeChainDuel(value: unknown): ChainDuelRecord | undefined {
  if (!value) return undefined

  const objectValue = value as Record<string, unknown>
  const arrayValue = value as readonly unknown[]
  const at = <T,>(key: string, index: number) => (objectValue[key] ?? arrayValue[index]) as T | undefined
  const creator = at<string>('creator', 0)
  if (!creator || creator === zeroAddress) return undefined

  const counterparty = at<string>('counterparty', 1)
  const creatorSideId = Number(at<number | bigint>('creatorSide', 2) || 0)
  const statusId = Number(at<number | bigint>('status', 6) || 0)
  const verdictId = Number(at<number | bigint>('verdict', 7) || 0)

  return {
    creator,
    counterparty: counterparty && counterparty !== zeroAddress ? counterparty : undefined,
    creatorSide: creatorSideId === 2 ? 'NO' : 'YES',
    stakeAmount: at<bigint>('stakeAmount', 3) || 0n,
    expiry: at<bigint>('expiry', 4) || 0n,
    status: duelStatusNames[statusId] || 'None',
    verdict: verdictNames[verdictId] || 'None',
    creatorClaimed: Boolean(at<boolean>('creatorClaimed', 8)),
    counterpartyClaimed: Boolean(at<boolean>('counterpartyClaimed', 9)),
  }
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
