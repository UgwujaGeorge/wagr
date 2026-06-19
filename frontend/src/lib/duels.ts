import type { DuelSide, DuelStatus, GenLayerVerdict } from '@wagr/shared'

export interface Duel {
  id: string
  claim: string
  category: string
  creator: string
  counterparty?: string
  creatorSide: DuelSide
  stakeEth: string
  potEth: string
  expiry: string
  status: DuelStatus
  evidenceUrls: string[]
  resolutionRules: string
  verdict?: GenLayerVerdict
}

export function oppositeSide(side: DuelSide): DuelSide {
  return side === 'YES' ? 'NO' : 'YES'
}

export function formatCountdown(expiry: string): string {
  const ms = new Date(expiry).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const hours = Math.floor(ms / 3_600_000)
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  if (days > 0) return `${days}d ${remHours}h`
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  return `${hours}h ${minutes}m`
}

export function statusTone(status: DuelStatus): string {
  if (status === 'Open') return 'tone-open'
  if (status === 'Active') return 'tone-active'
  if (status === 'Resolved' || status === 'Paid') return 'tone-resolved'
  if (status === 'Invalid' || status === 'Canceled') return 'tone-invalid'
  return 'tone-pending'
}
