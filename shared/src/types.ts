export type DuelSide = 'YES' | 'NO'
export type DuelStatus =
  | 'Open'
  | 'Active'
  | 'ResolutionRequested'
  | 'Resolved'
  | 'Invalid'
  | 'Canceled'
  | 'Paid'
  | 'VerdictProposed'
  | 'Challenged'

/** Index order must match `WagrDuelEscrow.DuelStatus`. */
export const duelStatusNames = [
  'None',
  'Open',
  'Active',
  'ResolutionRequested',
  'Resolved',
  'Invalid',
  'Canceled',
  'Paid',
  'VerdictProposed',
  'Challenged',
] as const
export type Verdict = 'YES' | 'NO' | 'INVALID' | 'UNRESOLVED'

export interface DuelMetadata {
  claim: string
  resolutionRules: string
  evidenceUrls: string[]
  allowedSourceTypes: string[]
  /** Machine-enforced host allowlist; part of the onchain metadata commitment. */
  allowedDomains: string[]
  category?: string
}

export interface SourceCheck {
  url: string
  status: 'reachable' | 'unreachable' | 'not_checked'
  relevance: string
  supports: Verdict
}

export interface GenLayerVerdict {
  resolution_scope: string
  duel_id: string
  base_chain_id: number
  base_duel_id: string
  metadata_hash: string
  authenticated_duel_data_hash: string
  verdict: Verdict
  confidence: number
  evidence_summary: string
  sources_checked: SourceCheck[]
  reasoning: string
  resolved_at: string
  invalid_reason: string
}
