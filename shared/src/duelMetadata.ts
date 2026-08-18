import { sha256, stringToBytes } from 'viem'

/**
 * Version tag for the canonical metadata encoding. Any change to the field set
 * or the encoding rules below MUST bump this string, because the encoding is a
 * consensus format shared by the frontend, the relayer, and the GenLayer
 * resolver.
 */
export const WAGR_METADATA_VERSION = 'wagr.metadata.v1'

export interface CommittedDuelMetadata {
  claim: string
  resolutionRules: string
  /** Order is significant and part of the commitment. */
  evidenceUrls: string[]
  /** Human/LLM facing source policy. Order is significant. */
  allowedSourceTypes: string[]
  /** Machine-enforced host allowlist. Order is significant. */
  allowedDomains: string[]
  category: string
}

/**
 * Canonical, length-prefixed encoding of the committed duel metadata.
 *
 * JSON is deliberately avoided here. `JSON.stringify` and Python's
 * `json.dumps` disagree on non-ASCII escaping, key ordering is incidental
 * rather than guaranteed, and separator defaults differ. This format is
 * unambiguous and byte-identical to reproduce in any language: every string is
 * written as its UTF-8 byte length, a colon, the raw bytes, and a newline, and
 * every list is preceded by its element count.
 */
export function canonicalDuelMetadata(metadata: CommittedDuelMetadata): string {
  const parts: string[] = [`${WAGR_METADATA_VERSION}\n`]
  parts.push(encodeField(metadata.claim))
  parts.push(encodeField(metadata.resolutionRules))
  parts.push(encodeList(metadata.evidenceUrls))
  parts.push(encodeList(metadata.allowedSourceTypes))
  parts.push(encodeList(metadata.allowedDomains))
  parts.push(encodeField(metadata.category))
  return parts.join('')
}

/** The bytes32 commitment stored onchain as `duels(duelId).metadataHash`. */
export function duelMetadataHash(metadata: CommittedDuelMetadata): `0x${string}` {
  return sha256(stringToBytes(canonicalDuelMetadata(metadata)))
}

export function metadataMatchesCommitment(
  metadata: CommittedDuelMetadata,
  committedHash: string,
): boolean {
  return duelMetadataHash(metadata).toLowerCase() === committedHash.toLowerCase()
}

/**
 * Host allowlist derived from the evidence URLs themselves. Committing this
 * alongside the URLs means the resolver can reject an out-of-policy fetch
 * deterministically, without asking a model to police its own inputs.
 */
export function deriveAllowedDomains(evidenceUrls: string[]): string[] {
  const domains = new Set<string>()
  for (const url of evidenceUrls) {
    const host = evidenceUrlHost(url)
    if (host) domains.add(host)
  }
  return [...domains].sort()
}

/** Lowercased host of an https URL, or undefined when the URL is unusable. */
export function evidenceUrlHost(url: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'https:') return undefined
  return parsed.hostname.toLowerCase()
}

/**
 * Deterministic source-policy check, mirrored byte-for-byte by
 * `_evidence_policy_error` in the GenLayer resolver.
 */
export function evidencePolicyError(metadata: CommittedDuelMetadata): string | undefined {
  if (metadata.evidenceUrls.length === 0) {
    return 'At least one evidence URL is required'
  }
  if (metadata.evidenceUrls.length > MAX_EVIDENCE_URLS) {
    return `At most ${MAX_EVIDENCE_URLS} evidence URLs are allowed`
  }
  if (metadata.allowedDomains.length === 0) {
    return 'Committed source policy has no allowed domains'
  }
  const allowed = new Set(metadata.allowedDomains.map((domain) => domain.toLowerCase()))
  for (const url of metadata.evidenceUrls) {
    const host = evidenceUrlHost(url)
    if (!host) {
      return `Evidence URL is not a valid https URL: ${url}`
    }
    if (!allowed.has(host)) {
      return `Evidence URL host is outside the committed source policy: ${host}`
    }
  }
  return undefined
}

export const MAX_EVIDENCE_URLS = 5

function encodeField(value: string): string {
  return `${utf8Length(value)}:${value}\n`
}

function encodeList(values: string[]): string {
  return `${values.length}\n${values.map(encodeField).join('')}`
}

function utf8Length(value: string): number {
  return stringToBytes(value).length
}
