import {
  authenticatedDuelDataHash,
  baseSepolia,
  canonicalGenLayerDuelId,
  duelMetadataHash,
  verdictAttestationTypedData,
  WAGR_RESOLUTION_SCOPE,
  type AuthenticatedDuelData,
  type BaseChainId,
  type GenLayerVerdict,
} from '@wagr/shared'
import assert from 'node:assert/strict'
import test from 'node:test'
import { privateKeyToAccount } from 'viem/accounts'
import { createRelayerApp, type RelayerAppDeps, type RelayerStorage } from './app.js'
import type { RelayerConfig } from './config.js'
import type { StoredDuelMetadata, StoredResolution } from './storage.js'

const validGenLayerTxHash = `0x${'ab'.repeat(32)}` as `0x${string}`
const baseTxHash = `0x${'cd'.repeat(32)}` as `0x${string}`
const verdictHash = `0x${'ef'.repeat(32)}` as `0x${string}`

const escrowAddress = '0x0000000000000000000000000000000000000001' as `0x${string}`
const attesterKey = `0x${'a1'.repeat(32)}` as `0x${string}`
const secondAttesterKey = `0x${'b2'.repeat(32)}` as `0x${string}`
const outsiderKey = `0x${'c3'.repeat(32)}` as `0x${string}`

const attesterAccount = privateKeyToAccount(attesterKey)
const secondAttesterAccount = privateKeyToAccount(secondAttesterKey)

const committedMetadata = {
  claim: 'Will GitHub issue 42 be closed before the expiry time?',
  resolutionRules: 'YES if the issue is closed before expiry. NO otherwise.',
  evidenceUrls: ['https://github.com/org/repo/issues/42'],
  allowedSourceTypes: ['GitHub issue'],
  allowedDomains: ['github.com'],
  category: 'GitHub',
}
const committedHash = duelMetadataHash(committedMetadata)

const config: RelayerConfig = {
  port: 8787,
  baseNetworks: {
    [baseSepolia.id]: {
      chainId: baseSepolia.id,
      name: 'Base Sepolia',
      rpcUrl: 'https://sepolia.base.org',
      explorerUrl: 'https://sepolia.basescan.org',
      escrowAddress,
    },
    8453: {
      chainId: 8453,
      name: 'Base Mainnet',
      rpcUrl: 'https://mainnet.base.org',
      explorerUrl: 'https://basescan.org',
      escrowAddress: '0x0000000000000000000000000000000000000003',
    },
  },
  relayerPrivateKey: `0x${'11'.repeat(32)}`,
  attesterPrivateKey: attesterKey,
  attesterEndpoints: [],
  attesterAuthToken: undefined,
  genlayerNetwork: 'studionet',
  genlayerRpcUrl: 'https://studio.genlayer.com/api',
  genlayerExplorerUrl: 'https://explorer-studio.genlayer.com',
  genlayerResolverAddress: '0x0000000000000000000000000000000000000002',
  requireGenlayerFinality: true,
}

// ------------------------------------------------------------------ helpers

function createMetadata(duelId: string, overrides: Partial<StoredDuelMetadata> = {}): StoredDuelMetadata {
  return {
    chainId: baseSepolia.id,
    duelId,
    ...committedMetadata,
    expiryTime: '2026-01-01T00:00:00.000Z',
    creatorSide: 'YES',
    counterpartySide: 'NO',
    metadataHash: committedHash,
    ...overrides,
  }
}

function createBaseDuel(duelId: string, overrides: Partial<AuthenticatedDuelData> = {}): AuthenticatedDuelData {
  return {
    chainId: baseSepolia.id,
    escrowAddress,
    duelId,
    creator: '0x00000000000000000000000000000000000000aa',
    counterparty: '0x00000000000000000000000000000000000000bb',
    creatorSide: 'YES',
    counterpartySide: 'NO',
    stakeAmountWei: '1000000000000000',
    expiry: String(Math.floor(new Date('2026-01-01T00:00:00.000Z').getTime() / 1000)),
    status: 'ResolutionRequested',
    metadataHash: committedHash,
    ...overrides,
  }
}

function createVerdict(
  verdict: GenLayerVerdict['verdict'],
  confidence: number,
  duelId: string,
  overrides: Partial<GenLayerVerdict> = {},
): GenLayerVerdict {
  const baseDuel = createBaseDuel(duelId)
  return {
    resolution_scope: WAGR_RESOLUTION_SCOPE,
    duel_id: canonicalGenLayerDuelId(baseSepolia.id, duelId),
    base_chain_id: baseSepolia.id,
    base_duel_id: duelId,
    metadata_hash: committedHash,
    authenticated_duel_data_hash: authenticatedDuelDataHash(baseDuel),
    verdict,
    confidence,
    evidence_summary: 'summary',
    sources_checked: [],
    reasoning: 'reasoning',
    resolved_at: '2026-01-01T00:00:01Z',
    invalid_reason: '',
    ...overrides,
  }
}

function createMemoryStorage(): RelayerStorage {
  const metadata = new Map<string, StoredDuelMetadata>()
  const resolutions = new Map<string, StoredResolution>()
  const key = (chainId: BaseChainId, duelId: string) => `${chainId}:${duelId}`
  return {
    getMetadata: (chainId, duelId) => metadata.get(key(chainId, duelId)),
    getResolution: (chainId, duelId) => resolutions.get(key(chainId, duelId)),
    listMetadata: (chainId) =>
      [...metadata.values()].filter((item) => (chainId ? item.chainId === chainId : true)),
    saveMetadata: (item) => {
      metadata.set(key(item.chainId, item.duelId), item)
      return item
    },
    saveResolution: (item) => {
      resolutions.set(key(item.chainId, item.duelId), item)
      return item
    },
  }
}

interface AppOptions {
  storage?: RelayerStorage
  configOverrides?: Partial<RelayerConfig>
  verdict?: GenLayerVerdict
  baseDuel?: AuthenticatedDuelData
  threshold?: number
  onSubmit?: (args: unknown[]) => void
  fetchImpl?: typeof fetch
  readDuelFromBase?: RelayerAppDeps['readDuelFromBase']
  readResolutionFromGenLayer?: RelayerAppDeps['readResolutionFromGenLayer']
}

function createApp(options: AppOptions = {}) {
  const storage = options.storage ?? createMemoryStorage()
  const appConfig = { ...config, ...options.configOverrides }
  const app = createRelayerApp({
    config: appConfig,
    storage,
    readDuelFromBase:
      options.readDuelFromBase ??
      (async (_config, chainId, duelId) => options.baseDuel ?? createBaseDuel(duelId.toString(), { chainId })),
    readResolutionFromGenLayer:
      options.readResolutionFromGenLayer ??
      (async () => ({
        verdict: options.verdict ?? createVerdict('YES', 90, '1'),
        genlayerTxHash: validGenLayerTxHash,
      })),
    readAttesterThreshold: async () => options.threshold ?? 1,
    submitVerdictToBase: async (...args) => {
      options.onSubmit?.(args as unknown[])
      return baseTxHash
    },
    verdictHash: () => verdictHash,
    fetchImpl: options.fetchImpl,
  })
  return { app, storage, config: appConfig }
}

function post(app: ReturnType<typeof createApp>['app'], path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

// ============================================ metadata commitment enforcement

test('metadata whose content does not hash to its commitment is rejected', async () => {
  const { app } = createApp()
  const response = await post(app, '/metadata', createMetadata('1', { claim: 'A completely different claim.' }))

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /does not match its metadataHash commitment/)
})

test('metadata is rejected when the commitment is not the one Base holds', async () => {
  const { app } = createApp({
    baseDuel: createBaseDuel('1', { metadataHash: `0x${'99'.repeat(32)}` }),
  })
  const response = await post(app, '/metadata', createMetadata('1'))

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /does not match the Base duel commitment/)
})

test('committed metadata cannot be replaced with different content', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('1'))
  const { app } = createApp({ storage })

  const mutated = { ...committedMetadata, claim: 'A rewritten claim that suits the attacker.' }
  const response = await post(
    app,
    '/metadata',
    createMetadata('1', { ...mutated, metadataHash: duelMetadataHash(mutated) }),
  )

  assert.equal(response.status, 400)
  const stored = await storage.getMetadata(baseSepolia.id, '1')
  assert.equal(stored?.claim, committedMetadata.claim)
})

test('valid committed metadata is accepted', async () => {
  const { app, storage } = createApp()
  const response = await post(app, '/metadata', createMetadata('1'))

  assert.equal(response.status, 201)
  assert.equal((await storage.getMetadata(baseSepolia.id, '1'))?.metadataHash, committedHash)
})

test('metadata with evidence outside the committed domain policy is rejected', async () => {
  const offPolicy = { ...committedMetadata, evidenceUrls: ['https://attacker.example/x'] }
  const { app } = createApp({
    baseDuel: createBaseDuel('1', { metadataHash: duelMetadataHash(offPolicy) }),
  })
  const response = await post(
    app,
    '/metadata',
    createMetadata('1', { ...offPolicy, metadataHash: duelMetadataHash(offPolicy) }),
  )

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /evidence policy is not satisfiable/)
})

test('resolution re-verifies the commitment and refuses tampered storage', async () => {
  const storage = createMemoryStorage()
  // Simulates a database mutated behind the API's back.
  await storage.saveMetadata(createMetadata('1', { claim: 'Storage was tampered with after creation.' }))
  const { app } = createApp({ storage })

  const response = await post(app, '/resolve/1', {
    chainId: baseSepolia.id,
    genlayerTxHash: validGenLayerTxHash,
  })

  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /no longer matches its commitment/)
})

// ================================================== attestation authorization

test('a verdict with no attestations is never submitted to Base', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('1'))
  let submitted = false
  const { app } = createApp({
    storage,
    configOverrides: { attesterPrivateKey: undefined },
    onSubmit: () => {
      submitted = true
    },
  })

  const response = await post(app, '/resolve/1', {
    chainId: baseSepolia.id,
    genlayerTxHash: validGenLayerTxHash,
  })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /No attester signed this verdict/)
  assert.equal(submitted, false)
})

test('a quorum short of the escrow threshold is not submitted', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('1'))
  let submitted = false
  const { app } = createApp({
    storage,
    threshold: 2,
    onSubmit: () => {
      submitted = true
    },
  })

  const response = await post(app, '/resolve/1', {
    chainId: baseSepolia.id,
    genlayerTxHash: validGenLayerTxHash,
  })

  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /only 1 of the required 2 attestations/)
  assert.equal(submitted, false)
})

test('a satisfied quorum submits sorted signatures to Base', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('1'))
  let submittedArgs: unknown[] = []

  const remote = await signAttestation(secondAttesterKey, '1', 'YES', 9_000)
  const { app } = createApp({
    storage,
    threshold: 2,
    configOverrides: { attesterEndpoints: ['https://attester-2.example'] },
    fetchImpl: stubFetch(remote),
    onSubmit: (args) => {
      submittedArgs = args
    },
  })

  const response = await post(app, '/resolve/1', {
    chainId: baseSepolia.id,
    genlayerTxHash: validGenLayerTxHash,
  })

  assert.equal(response.status, 200)
  const signatures = submittedArgs[8] as `0x${string}`[]
  assert.equal(signatures.length, 2)

  const digest = attestationDigest('1', 'YES', 9_000)
  const recovered = await Promise.all(
    signatures.map((signature) => recoverAttester(digest, signature)),
  )
  // Ascending signer order is what the escrow requires to reject duplicates.
  assert.deepEqual(recovered, [...recovered].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1)))
  assert.equal(new Set(recovered.map((address) => address.toLowerCase())).size, 2)
})

test('attesters that disagree about the verdict block submission', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('1'))
  let submitted = false

  // Remote attester signs NO while the local attester saw YES.
  const remote = await signAttestation(secondAttesterKey, '1', 'NO', 9_000)
  const { app } = createApp({
    storage,
    threshold: 2,
    configOverrides: { attesterEndpoints: ['https://attester-2.example'] },
    fetchImpl: stubFetch(remote),
    onSubmit: () => {
      submitted = true
    },
  })

  const response = await post(app, '/resolve/1', {
    chainId: baseSepolia.id,
    genlayerTxHash: validGenLayerTxHash,
  })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /Attesters disagreed/)
  assert.equal(submitted, false)
})

test('a duplicated attester signature counts only once', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('1'))
  let submitted = false

  // Remote endpoint replays the local attester's own identity.
  const remote = await signAttestation(attesterKey, '1', 'YES', 9_000)
  const { app } = createApp({
    storage,
    threshold: 2,
    configOverrides: { attesterEndpoints: ['https://attester-clone.example'] },
    fetchImpl: stubFetch(remote),
    onSubmit: () => {
      submitted = true
    },
  })

  const response = await post(app, '/resolve/1', {
    chainId: baseSepolia.id,
    genlayerTxHash: validGenLayerTxHash,
  })

  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /only 1 of the required 2/)
  assert.equal(submitted, false)
})

test('an unreachable attester is reported rather than silently skipped', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('1'))
  const { app } = createApp({
    storage,
    threshold: 1,
    configOverrides: { attesterEndpoints: ['https://offline.example'] },
    fetchImpl: async () => new Response(JSON.stringify({ error: 'boom' }), { status: 503 }),
  })

  const response = await post(app, '/resolve/1', {
    chainId: baseSepolia.id,
    genlayerTxHash: validGenLayerTxHash,
  })

  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.attesterFailures.length, 1)
  assert.match(body.attesterFailures[0], /offline\.example/)
})

test('the attester endpoint refuses to sign a verdict bound to another duel', async () => {
  const { app } = createApp({
    verdict: createVerdict('YES', 90, '1', { duel_id: canonicalGenLayerDuelId(baseSepolia.id, '999') }),
  })

  const response = await post(app, '/attest', {
    chainId: baseSepolia.id,
    duelId: '1',
    metadata: createMetadata('1'),
    genlayerTxHash: validGenLayerTxHash,
  })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /bound to a different Base duel/)
})

test('the attester endpoint refuses tampered metadata', async () => {
  const { app } = createApp()

  const response = await post(app, '/attest', {
    chainId: baseSepolia.id,
    duelId: '1',
    metadata: createMetadata('1', { claim: 'A claim nobody committed to.' }),
    genlayerTxHash: validGenLayerTxHash,
  })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /does not match its committed metadata hash/)
})

test('the attester endpoint refuses a duel Base has not marked for resolution', async () => {
  const { app } = createApp({ baseDuel: createBaseDuel('1', { status: 'Active' }) })

  const response = await post(app, '/attest', {
    chainId: baseSepolia.id,
    duelId: '1',
    metadata: createMetadata('1'),
    genlayerTxHash: validGenLayerTxHash,
  })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /is not attestable/)
})

test('the attester endpoint rejects a mismatched authenticated duel data hash', async () => {
  const { app } = createApp({
    verdict: createVerdict('YES', 90, '1', { authenticated_duel_data_hash: `0x${'44'.repeat(32)}` }),
  })

  const response = await post(app, '/attest', {
    chainId: baseSepolia.id,
    duelId: '1',
    metadata: createMetadata('1'),
    genlayerTxHash: validGenLayerTxHash,
  })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /authenticated duel data hash does not match/)
})

test('the attester endpoint enforces its auth token', async () => {
  const { app } = createApp({ configOverrides: { attesterAuthToken: 'secret-token' } })

  const unauthorized = await post(app, '/attest', {
    chainId: baseSepolia.id,
    duelId: '1',
    metadata: createMetadata('1'),
    genlayerTxHash: validGenLayerTxHash,
  })
  assert.equal(unauthorized.status, 401)

  const authorized = await post(
    app,
    '/attest',
    { chainId: baseSepolia.id, duelId: '1', metadata: createMetadata('1'), genlayerTxHash: validGenLayerTxHash },
    { authorization: 'Bearer secret-token' },
  )
  assert.equal(authorized.status, 200)
})

test('a GenLayer transaction that is not finalized blocks attestation', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('1'))
  let submitted = false
  const { app } = createApp({
    storage,
    readResolutionFromGenLayer: async () => {
      throw new Error('GenLayer transaction is not FINALIZED yet; refusing to attest an appealable verdict')
    },
    onSubmit: () => {
      submitted = true
    },
  })

  const response = await post(app, '/resolve/1', {
    chainId: baseSepolia.id,
    genlayerTxHash: validGenLayerTxHash,
  })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /not FINALIZED/)
  assert.equal(submitted, false)
})

// ================================================================= lifecycle

test('UNRESOLVED submits INVALID to Base and preserves the reason', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('1'))
  let submittedArgs: unknown[] = []
  const { app } = createApp({
    storage,
    verdict: createVerdict('UNRESOLVED', 0, '1', {
      invalid_reason: 'Evidence URL could not be reached: https://github.com',
    }),
    onSubmit: (args) => {
      submittedArgs = args
    },
  })

  const response = await post(app, '/resolve/1', {
    chainId: baseSepolia.id,
    genlayerTxHash: validGenLayerTxHash,
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(submittedArgs[3], 'INVALID')
  assert.equal(body.verdict.verdict, 'UNRESOLVED')
  assert.match(body.nextStep, /could not be reached/)
})

test('YES and NO verdicts submit to Base', async (t) => {
  for (const verdict of ['YES', 'NO'] as const) {
    await t.test(verdict, async () => {
      const storage = createMemoryStorage()
      await storage.saveMetadata(createMetadata('1'))
      let submittedArgs: unknown[] = []
      const { app } = createApp({
        storage,
        verdict: createVerdict(verdict, 88, '1'),
        onSubmit: (args) => {
          submittedArgs = args
        },
      })

      const response = await post(app, '/resolve/1', {
        chainId: baseSepolia.id,
        genlayerTxHash: validGenLayerTxHash,
      })

      assert.equal(response.status, 200)
      assert.equal(submittedArgs[3], verdict)
      assert.equal(submittedArgs[4], 8_800)
    })
  }
})

test('a missing GenLayer transaction hash is rejected', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('1'))
  const { app } = createApp({ storage })

  const response = await post(app, '/resolve/1', { chainId: baseSepolia.id })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /GenLayer transaction hash is required/)
})

test('a malformed GenLayer transaction hash is rejected', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('1'))
  const { app } = createApp({ storage })

  const response = await post(app, '/resolve/1', { chainId: baseSepolia.id, genlayerTxHash: '0xdeadbeef' })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /GenLayer transaction hash is required/)
})

test('unsupported chain ID is rejected before Base submission', async () => {
  const { app } = createApp()
  const response = await post(app, '/resolve/1', { chainId: 1, genlayerTxHash: validGenLayerTxHash })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /Unsupported Base chain ID/)
})

test('missing chain ID is rejected before Base submission', async () => {
  const { app } = createApp()
  const response = await post(app, '/resolve/1', { genlayerTxHash: validGenLayerTxHash })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /chainId is required/)
})

test('accepted duel must be marked resolution requested before bridging', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('1'))
  const { app } = createApp({ storage, baseDuel: createBaseDuel('1', { status: 'Active' }) })

  const response = await post(app, '/resolve/1', {
    chainId: baseSepolia.id,
    genlayerTxHash: validGenLayerTxHash,
  })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /resolution requested/)
})

test('the health endpoint reports attester configuration', async () => {
  const { app } = createApp()
  const body = await (await app.request('/health')).json()

  assert.equal(body.attesterConfigured, true)
  assert.equal(body.requiresGenlayerFinality, true)
})

// ------------------------------------------------------- attestation helpers

function attestationDigest(duelId: string, verdict: 'YES' | 'NO' | 'INVALID', confidenceBps: number) {
  return verdictAttestationTypedData(baseSepolia.id, escrowAddress, {
    duelId: BigInt(duelId),
    verdict,
    confidenceBps,
    metadataHash: committedHash,
    authenticatedDuelDataHash: authenticatedDuelDataHash(createBaseDuel(duelId)),
    verdictHash,
    genlayerTxHash: validGenLayerTxHash,
  })
}

async function signAttestation(
  key: `0x${string}`,
  duelId: string,
  verdict: 'YES' | 'NO' | 'INVALID',
  confidenceBps: number,
) {
  const account = privateKeyToAccount(key)
  return {
    signer: account.address,
    signature: await account.signTypedData(attestationDigest(duelId, verdict, confidenceBps)),
    verdict,
    confidenceBps,
    metadataHash: committedHash,
    verdictHash,
    genlayerTxHash: validGenLayerTxHash,
  }
}

function stubFetch(payload: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch
}

async function recoverAttester(
  typedData: ReturnType<typeof attestationDigest>,
  signature: `0x${string}`,
): Promise<`0x${string}`> {
  const { recoverTypedDataAddress } = await import('viem')
  return recoverTypedDataAddress({ ...typedData, signature })
}

// Referenced so the unused-import guard stays honest about the accounts above.
void attesterAccount
void secondAttesterAccount
void outsiderKey
