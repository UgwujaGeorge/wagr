#!/usr/bin/env node
/**
 * Cross-language consistency check for the two commitments that bind the
 * bridge together.
 *
 * 1. `duelMetadataHash` must be identical in TypeScript (frontend + relayer)
 *    and in Python (the GenLayer resolver).
 * 2. `authenticatedDuelDataHash` must be identical in TypeScript, in Python
 *    (the resolver recomputes it to bind the expiry and every other
 *    Base-derived prompt input) and in Solidity's
 *    `WagrDuelEscrow.duelStateHash`. The resolver carries its own Keccak-256
 *    because GenVM's `hashlib` has no Ethereum-compatible one, so this is the
 *    check that keeps that implementation honest.
 * 3. `expiryTimeIso` must be identical in TypeScript and Python, because the
 *    attester compares the expiry the resolver adjudicated against with the
 *    expiry Base holds as plain strings.
 * 4. The argument tuple `genlayerResolveArgs` builds must be the one
 *    `resolve_duel` expects. These are positional arguments crossing a
 *    language boundary, so a reordering would typecheck, deploy, and only fail
 *    against the live resolver.
 *
 * A silent divergence in either would break resolution in a way no
 * single-language test suite can see, so this runs the real implementations
 * against each other rather than re-deriving them.
 */
import { execFileSync } from 'node:child_process'
import {
  authenticatedDuelDataHash,
  duelMetadataHash,
  evidenceUrlHost,
  expiryTimeIso,
  genlayerResolveArgs,
} from '../shared/dist/index.js'

/** Runs a snippet against the real resolver module, with the GenVM stub in place. */
function inResolver(body) {
  return `
import json, sys, importlib.util
sys.path.insert(0, "genlayer/tests")
import genlayer_stub
sys.modules["genlayer"] = genlayer_stub
spec = importlib.util.spec_from_file_location("wagr_resolver", "genlayer/contracts/wagr_resolver.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
resolver = mod.WagrResolver.__new__(mod.WagrResolver)
${body}
`
}

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

// Epoch, a whole minute, a second that is not, a leap day, and a far-future
// expiry: the cases where a millisecond suffix or an offset would show up.
const expiryFixtures = [0, 1790000000, 1790000001, 1709164800, 1999999999, 4102444800]

const hostFixtures = [
  'https://example.com/x',
  'https://localhost/x',
  'https://example.com@attacker.example/x',
  'https://example.com:8443/x',
  'https://1.2.3.4/x',
  'http://example.com/x',
  'https://sub.example.com/x',
  'https://EXAMPLE.com/x',
  'https://user:pw@example.com:443/x?q=1#f',
  'not a url',
]

function pythonHosts(urls) {
  const script = inResolver('print(json.dumps([resolver._https_host(u) for u in json.loads(sys.stdin.read())]))')
  return JSON.parse(
    execFileSync('python3', ['-c', script], { input: JSON.stringify(urls), encoding: 'utf8' }),
  )
}

function pythonDuelStateHash(duel) {
  const script = inResolver(`
d = json.loads(sys.stdin.read())
print(resolver._authenticated_duel_data_hash(
    d["chainId"], d["escrowAddress"], d["duelId"], d["creator"], d["counterparty"],
    d["creatorSide"], int(d["stakeAmountWei"]), int(d["expiry"]), d["metadataHash"],
))
`)
  return execFileSync('python3', ['-c', script], {
    input: JSON.stringify(duel),
    encoding: 'utf8',
  }).trim().toLowerCase()
}

function pythonBindingContext(args) {
  // A reordered tuple makes `_binding_context` raise rather than return, so the
  // error is reported as a mismatch instead of a Python traceback.
  const script = inResolver(`
args = json.loads(sys.stdin.read())
try:
    print(json.dumps(resolver._binding_context(*args[:11])))
except Exception as error:
    print(json.dumps({"error": str(error)}))
`)
  return JSON.parse(
    execFileSync('python3', ['-c', script], { input: JSON.stringify(args), encoding: 'utf8' }),
  )
}

function pythonExpiryIso(timestamps) {
  const script = inResolver(
    'print(json.dumps([resolver._format_timestamp(t) for t in json.loads(sys.stdin.read())]))',
  )
  return JSON.parse(
    execFileSync('python3', ['-c', script], { input: JSON.stringify(timestamps), encoding: 'utf8' }),
  )
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

console.log('duel state hash: TypeScript vs Python vs Solidity abi.encode')
for (const [index, duel] of duelFixtures.entries()) {
  const ts = authenticatedDuelDataHash(duel).toLowerCase()
  const sol = castKeccakOfAbiEncode(duel)
  const py = pythonDuelStateHash(duel)
  const ok = ts === sol && ts === py
  if (!ok) failures++
  console.log(
    `  fixture ${index}: ${ok ? 'match' : 'MISMATCH'} ${ts}${ok ? '' : ` != solidity ${sol} / python ${py}`}`,
  )
}

console.log('expiry rendering: TypeScript vs Python')
{
  const py = pythonExpiryIso(expiryFixtures)
  expiryFixtures.forEach((timestamp, index) => {
    const ts = expiryTimeIso(timestamp)
    const ok = ts === py[index]
    if (!ok) failures++
    console.log(`  ${ok ? 'match   ' : 'MISMATCH'} ${timestamp} -> ${ts}${ok ? '' : ` != ${py[index]}`}`)
  })
}

console.log('resolve_duel arguments: TypeScript call site vs Python signature')
for (const [index, duel] of duelFixtures.entries()) {
  const args = genlayerResolveArgs(duel, metadataFixtures[index])
  const binding = pythonBindingContext(args)
  const problems = []
  if (binding.error) problems.push(binding.error)
  if (binding.authenticated_duel_data_hash !== authenticatedDuelDataHash(duel).toLowerCase()) {
    problems.push('duel data hash')
  }
  if (binding.expiry_time !== expiryTimeIso(duel.expiry)) problems.push('expiry')
  if (binding.creator_side !== duel.creatorSide) problems.push('creator side')
  if (binding.counterparty_side !== duel.counterpartySide) problems.push('counterparty side')
  if (binding.stake_amount_wei !== duel.stakeAmountWei) problems.push('stake')
  if (binding.base_escrow_address !== duel.escrowAddress.toLowerCase()) problems.push('escrow')
  if (binding.creator !== duel.creator.toLowerCase()) problems.push('creator')
  if (binding.counterparty !== duel.counterparty.toLowerCase()) problems.push('counterparty')
  if (problems.length > 0) failures++
  console.log(
    `  fixture ${index}: ${problems.length === 0 ? 'the resolver reads every argument as sent' : `MISMATCH on ${problems.join(', ')}`}`,
  )
}

console.log('evidence host parsing: TypeScript vs Python')
{
  const py = pythonHosts(hostFixtures)
  hostFixtures.forEach((url, index) => {
    const ts = evidenceUrlHost(url) ?? null
    const ok = ts === py[index]
    if (!ok) failures++
    console.log(`  ${ok ? 'match   ' : 'MISMATCH'} ${url} -> ${ts}${ok ? '' : ` != ${py[index]}`}`)
  })
}

if (failures > 0) {
  console.error(`\n${failures} encoding mismatch(es)`)
  process.exit(1)
}
console.log('\nall encodings agree across TypeScript, Python and Solidity')
