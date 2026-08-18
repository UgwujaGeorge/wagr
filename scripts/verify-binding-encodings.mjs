#!/usr/bin/env node
/**
 * Cross-language consistency check for the two commitments that bind the
 * bridge together.
 *
 * 1. `duelMetadataHash` must be identical in TypeScript (frontend + relayer)
 *    and in Python (the GenLayer resolver).
 * 2. `authenticatedDuelDataHash` must be identical in TypeScript and in
 *    Solidity's `WagrDuelEscrow.duelStateHash`.
 *
 * A silent divergence in either would break resolution in a way no
 * single-language test suite can see, so this runs the real implementations
 * against each other rather than re-deriving them.
 */
import { execFileSync } from 'node:child_process'
import { authenticatedDuelDataHash, duelMetadataHash } from '../shared/dist/index.js'

const metadataFixtures = [
  {
    claim: 'Will GitHub issue #42 be closed before Friday?',
    resolutionRules: 'YES if closed before expiry. NO otherwise.',
    evidenceUrls: ['https://github.com/org/repo/issues/42'],
    allowedSourceTypes: ['GitHub issue'],
    allowedDomains: ['github.com'],
    category: 'GitHub',
  },
  {
    claim: 'Émoji ✅ and ünicode — does it hash the same?',
    resolutionRules: 'Rules with "quotes", \\backslash\\ and \nnewline',
    evidenceUrls: ['https://a.example.com/x?y=1', 'https://b.example.com/'],
    allowedSourceTypes: ['official docs', 'verified announcement'],
    allowedDomains: ['a.example.com', 'b.example.com'],
    category: 'Launch',
  },
  {
    claim: '',
    resolutionRules: '',
    evidenceUrls: [],
    allowedSourceTypes: [],
    allowedDomains: [],
    category: '',
  },
]

const duelFixtures = [
  {
    chainId: 84532,
    escrowAddress: '0x1854520Dbc6BE60e5298c4e5d13a8DdC08f91656',
    duelId: '1',
    creator: '0x844d39D406D5dCC22291C4e2D8CE1541d39d0039',
    counterparty: '0xBa250C8ddb4bcB0E5C386e7Efe1A5B686053b207',
    creatorSide: 'YES',
    counterpartySide: 'NO',
    stakeAmountWei: '1000000000000000',
    expiry: '1790000000',
    status: 'ResolutionRequested',
    metadataHash: `0x${'ab'.repeat(32)}`,
  },
  {
    chainId: 8453,
    escrowAddress: '0x602d022B9E9c415F399F77d5be69404F2219dc99',
    duelId: '987654321',
    creator: '0x0000000000000000000000000000000000000001',
    counterparty: '0x0000000000000000000000000000000000000002',
    creatorSide: 'NO',
    counterpartySide: 'YES',
    stakeAmountWei: '123456789012345678',
    expiry: '1999999999',
    status: 'Challenged',
    metadataHash: `0x${'0f'.repeat(32)}`,
  },
]

function castKeccakOfAbiEncode(duel) {
  const encoded = execFileSync(
    'cast',
    [
      'abi-encode',
      'f(uint256,address,uint256,address,address,uint8,uint256,uint256,bytes32)',
      String(duel.chainId),
      duel.escrowAddress,
      duel.duelId,
      duel.creator,
      duel.counterparty,
      duel.creatorSide === 'YES' ? '1' : '2',
      duel.stakeAmountWei,
      duel.expiry,
      duel.metadataHash,
    ],
    { encoding: 'utf8' },
  ).trim()
  return execFileSync('cast', ['keccak', encoded], { encoding: 'utf8' }).trim().toLowerCase()
}

function pythonMetadataHash(metadata) {
  const script = `
import hashlib, json, sys
m = json.loads(sys.stdin.read())
def field(v):
    t = str(v)
    return f"{len(t.encode('utf-8'))}:{t}\\n"
def lst(vs):
    return f"{len(vs)}\\n" + "".join(field(v) for v in vs)
canonical = ("wagr.metadata.v1\\n" + field(m["claim"]) + field(m["resolutionRules"])
    + lst(m["evidenceUrls"]) + lst(m["allowedSourceTypes"]) + lst(m["allowedDomains"])
    + field(m["category"]))
print("0x" + hashlib.sha256(canonical.encode("utf-8")).hexdigest())
`
  return execFileSync('python3', ['-c', script], {
    input: JSON.stringify(metadata),
    encoding: 'utf8',
  }).trim().toLowerCase()
}

let failures = 0

console.log('metadata commitment: TypeScript vs Python')
for (const [index, metadata] of metadataFixtures.entries()) {
  const ts = duelMetadataHash(metadata).toLowerCase()
  const py = pythonMetadataHash(metadata)
  const ok = ts === py
  if (!ok) failures++
  console.log(`  fixture ${index}: ${ok ? 'match' : 'MISMATCH'} ${ts}${ok ? '' : ` != ${py}`}`)
}

console.log('duel state hash: TypeScript vs Solidity abi.encode')
for (const [index, duel] of duelFixtures.entries()) {
  const ts = authenticatedDuelDataHash(duel).toLowerCase()
  const sol = castKeccakOfAbiEncode(duel)
  const ok = ts === sol
  if (!ok) failures++
  console.log(`  fixture ${index}: ${ok ? 'match' : 'MISMATCH'} ${ts}${ok ? '' : ` != ${sol}`}`)
}

if (failures > 0) {
  console.error(`\n${failures} encoding mismatch(es)`)
  process.exit(1)
}
console.log('\nall encodings agree across TypeScript, Python and Solidity')
