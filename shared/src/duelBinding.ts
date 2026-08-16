import { keccak256, stringToHex } from 'viem'
import type { BaseChainId } from './constants.js'
import type { DuelSide, DuelStatus } from './types.js'

export const WAGR_RESOLUTION_SCOPE = 'wagr.base.genlayer.v1'

export interface AuthenticatedDuelData {
  chainId: BaseChainId
  duelId: string
  creator: string
  counterparty: string
  creatorSide: DuelSide
  counterpartySide: DuelSide
  stakeAmountWei: string
  expiry: string
  status: DuelStatus
  metadataHash: `0x${string}`
}

export function canonicalGenLayerDuelId(chainId: BaseChainId, duelId: string): string {
  return `${chainId}:${duelId}`
}

export function canonicalizeAuthenticatedDuelData(data: AuthenticatedDuelData): AuthenticatedDuelData {
  return {
    chainId: data.chainId,
    duelId: String(data.duelId),
    creator: data.creator.toLowerCase(),
    counterparty: data.counterparty.toLowerCase(),
    creatorSide: data.creatorSide,
    counterpartySide: data.counterpartySide,
    stakeAmountWei: String(data.stakeAmountWei),
    expiry: String(data.expiry),
    status: data.status,
    metadataHash: data.metadataHash.toLowerCase() as `0x${string}`,
  }
}

export function authenticatedDuelDataJson(data: AuthenticatedDuelData): string {
  return JSON.stringify(canonicalizeAuthenticatedDuelData(data))
}

export function authenticatedDuelDataHash(data: AuthenticatedDuelData): `0x${string}` {
  return keccak256(stringToHex(authenticatedDuelDataJson(data)))
}
