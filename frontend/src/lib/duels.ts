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

export const demoDuels: Duel[] = [
  {
    id: '101',
    claim: 'Will GitHub issue #42 be closed before Friday 18:00 UTC?',
    category: 'GitHub',
    creator: '0x9F3...81A',
    creatorSide: 'YES',
    stakeEth: '0.01',
    potEth: '0.02',
    expiry: new Date(Date.now() + 1000 * 60 * 60 * 27).toISOString(),
    status: 'Open',
    evidenceUrls: ['https://github.com/example/project/issues/42'],
    resolutionRules:
      'YES if the linked GitHub issue is closed before the expiry timestamp. NO if it remains open. INVALID if the issue cannot be accessed.',
  },
  {
    id: '102',
    claim: 'Will the protocol status page remain operational for the next 24 hours?',
    category: 'Uptime',
    creator: '0x71C...4F2',
    counterparty: '0xA0B...91D',
    creatorSide: 'NO',
    stakeEth: '0.025',
    potEth: '0.05',
    expiry: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
    status: 'Active',
    evidenceUrls: ['https://status.example.org'],
    resolutionRules:
      'YES if the page shows all systems operational at expiry. NO if the status page shows degraded performance or outage.',
  },
  {
    id: '103',
    claim: 'Will Project Atlas publish a public testnet launch announcement before July 31?',
    category: 'Launch',
    creator: '0x34E...C9B',
    counterparty: '0x68D...EE0',
    creatorSide: 'YES',
    stakeEth: '0.015',
    potEth: '0.03',
    expiry: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    status: 'Resolved',
    evidenceUrls: ['https://example.org/docs/testnet'],
    resolutionRules:
      'YES if official sources confirm public testnet launch before expiry. NO if no allowed official source confirms it.',
    verdict: {
      verdict: 'YES',
      confidence: 86,
      evidence_summary: 'Official docs state that the public testnet launched before the deadline.',
      sources_checked: [
        {
          url: 'https://example.org/docs/testnet',
          status: 'reachable',
          relevance: 'Official project documentation.',
          supports: 'YES',
        },
      ],
      reasoning:
        'The claim required an official confirmation before expiry. The documentation page is an allowed source and confirms launch before the deadline.',
      resolved_at: new Date().toISOString(),
      invalid_reason: '',
    },
  },
]

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

