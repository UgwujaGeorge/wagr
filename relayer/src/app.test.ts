import {
  authenticatedDuelDataHash,
  baseSepolia,
  canonicalGenLayerDuelId,
  WAGR_RESOLUTION_SCOPE,
  type AuthenticatedDuelData,
  type BaseChainId,
  type GenLayerVerdict,
} from '@wagr/shared'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRelayerApp, type RelayerStorage } from './app.js'
import type { RelayerConfig } from './config.js'
import type { StoredDuelMetadata, StoredResolution } from './storage.js'

const validGenLayerTxHash = `0x${'ab'.repeat(32)}` as `0x${string}`
const baseTxHash = `0x${'cd'.repeat(32)}` as `0x${string}`
const verdictHash = `0x${'ef'.repeat(32)}` as `0x${string}`

const config: RelayerConfig = {
  port: 8787,
  baseNetworks: {
    [baseSepolia.id]: {
      chainId: baseSepolia.id,
      name: 'Base Sepolia',
      rpcUrl: 'https://sepolia.base.org',
      explorerUrl: 'https://sepolia.basescan.org',
      escrowAddress: '0x0000000000000000000000000000000000000001',
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
  genlayerNetwork: 'studionet',
  genlayerRpcUrl: 'https://studio.genlayer.com/api',
  genlayerExplorerUrl: 'https://explorer-studio.genlayer.com',
  genlayerResolverAddress: '0x0000000000000000000000000000000000000002',
}

test('UNRESOLVED submits INVALID to Base and preserves the reason', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('1'))
  let baseSubmitCount = 0
  let submittedVerdict: string | undefined

  const app = createRelayerApp({
    config,
    readDuelFromBase: async (_config, chainId, duelId) => createBaseDuel(duelId.toString(), { chainId }),
    readResolutionFromGenLayer: async () => ({
      verdict: {
        ...createVerdict('UNRESOLVED', 0, '1'),
        invalid_reason: 'Evidence URL could not be reached: https://example.com',
      },
      genlayerTxHash: validGenLayerTxHash,
    }),
    storage,
    submitVerdictToBase: async (_config, _chainId, _duelId, verdict) => {
      baseSubmitCount += 1
      submittedVerdict = verdict
      return baseTxHash
    },
    verdictHash: () => verdictHash,
  })

  const response = await postResolve(app, '1')
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(baseSubmitCount, 1)
  assert.equal(submittedVerdict, 'INVALID')
  assert.equal(body.baseSubmitted, true)
  assert.equal(body.baseTxHash, baseTxHash)
  assert.equal(body.baseSubmitError, undefined)
  assert.match(body.nextStep, /UNRESOLVED/)
  assert.match(body.nextStep, /Submitted as INVALID on Base/)
  assert.equal((await storage.getResolution(baseSepolia.id, '1'))?.baseSubmitted, true)
  assert.equal((await storage.getResolution(baseSepolia.id, '1'))?.verdict.verdict, 'UNRESOLVED')
})

test('YES and NO verdicts submit to Base', async (t) => {
  for (const verdict of ['YES', 'NO'] as const) {
    await t.test(`${verdict} submits`, async () => {
      const storage = createMemoryStorage()
      await storage.saveMetadata(createMetadata('7'))
      const submitted: Array<{ chainId: BaseChainId; duelId: bigint; verdict: string; confidence: number; hash: `0x${string}` }> = []

      const app = createRelayerApp({
        config,
        readDuelFromBase: async (_config, chainId, duelId) => createBaseDuel(duelId.toString(), { chainId }),
        readResolutionFromGenLayer: async () => ({
          verdict: createVerdict(verdict, 92, '7'),
          genlayerTxHash: validGenLayerTxHash,
        }),
        storage,
        submitVerdictToBase: async (_config, chainId, duelId, submittedVerdict, confidence, _metadataHash, hash) => {
          submitted.push({ chainId, duelId, verdict: submittedVerdict, confidence, hash })
          return baseTxHash
        },
        verdictHash: () => verdictHash,
      })

      const response = await postResolve(app, '7')
      const body = await response.json()

      assert.equal(response.status, 200)
      assert.deepEqual(submitted, [{ chainId: baseSepolia.id, duelId: 7n, verdict, confidence: 92, hash: verdictHash }])
      assert.equal(body.baseSubmitted, true)
      assert.equal(body.baseTxHash, baseTxHash)
      assert.equal(body.nextStep, 'Verdict submitted to Base.')
      assert.equal((await storage.getResolution(baseSepolia.id, '7'))?.verdict.verdict, verdict)
    })
  }
})

test('bad GenLayer transaction hash returns a clean error', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('3'))
  let readCalled = false

  const app = createRelayerApp({
    config,
    readDuelFromBase: async (_config, chainId, duelId) => createBaseDuel(duelId.toString(), { chainId }),
    readResolutionFromGenLayer: async () => {
      readCalled = true
      return { verdict: createVerdict('YES', 90, '3') }
    },
    storage,
    submitVerdictToBase: async () => baseTxHash,
    verdictHash: () => verdictHash,
  })

  const response = await app.request('/resolve/3', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chainId: baseSepolia.id, genlayerTxHash: 'bad-hash' }),
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(readCalled, false)
  assert.deepEqual(body, {
    error: 'Invalid GenLayer transaction hash. Expected a 32-byte 0x-prefixed transaction hash.',
  })
})

test('unsupported chain ID is rejected before Base submission', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('5'))
  let baseSubmitCount = 0

  const app = createRelayerApp({
    config,
    readDuelFromBase: async (_config, chainId, duelId) => createBaseDuel(duelId.toString(), { chainId }),
    readResolutionFromGenLayer: async () => ({
      verdict: createVerdict('YES', 90, '5'),
      genlayerTxHash: validGenLayerTxHash,
    }),
    storage,
    submitVerdictToBase: async () => {
      baseSubmitCount += 1
      return baseTxHash
    },
    verdictHash: () => verdictHash,
  })

  const response = await app.request('/resolve/5', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chainId: 1, genlayerTxHash: validGenLayerTxHash }),
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(baseSubmitCount, 0)
  assert.match(body.error, /Unsupported Base chain ID/)
})

test('missing chain ID is rejected before Base submission', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('6'))
  let baseSubmitCount = 0

  const app = createRelayerApp({
    config,
    readDuelFromBase: async (_config, chainId, duelId) => createBaseDuel(duelId.toString(), { chainId }),
    readResolutionFromGenLayer: async () => ({
      verdict: createVerdict('YES', 90, '6'),
      genlayerTxHash: validGenLayerTxHash,
    }),
    storage,
    submitVerdictToBase: async () => {
      baseSubmitCount += 1
      return baseTxHash
    },
    verdictHash: () => verdictHash,
  })

  const response = await app.request('/resolve/6', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ genlayerTxHash: validGenLayerTxHash }),
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(baseSubmitCount, 0)
  assert.match(body.error, /chainId is required/)
})

test('unresolved GenLayer transaction lookup returns a clean JSON error', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('4'))
  let baseSubmitCount = 0

  const app = createRelayerApp({
    config,
    readDuelFromBase: async (_config, chainId, duelId) => createBaseDuel(duelId.toString(), { chainId }),
    readResolutionFromGenLayer: async (_config, _duelId, genlayerTxHash) => {
      assert.equal(genlayerTxHash, validGenLayerTxHash)
      throw new Error('GenLayer resolver has not stored a verdict for this duel yet')
    },
    storage,
    submitVerdictToBase: async () => {
      baseSubmitCount += 1
      return baseTxHash
    },
    verdictHash: () => verdictHash,
  })

  const response = await postResolve(app, '4')
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(baseSubmitCount, 0)
  assert.deepEqual(body, {
    error: 'GenLayer resolver has not stored a verdict for this duel yet',
  })
})

test('pre-resolved GenLayer verdict without Base binding is rejected before Base submission', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('9'))
  let baseSubmitCount = 0

  const app = createRelayerApp({
    config,
    readDuelFromBase: async (_config, chainId, duelId) => createBaseDuel(duelId.toString(), { chainId }),
    readResolutionFromGenLayer: async () => ({
      verdict: createLegacyVerdict('YES'),
      genlayerTxHash: validGenLayerTxHash,
    }),
    storage,
    submitVerdictToBase: async () => {
      baseSubmitCount += 1
      return baseTxHash
    },
    verdictHash: () => verdictHash,
  })

  const response = await postResolve(app, '9')
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(baseSubmitCount, 0)
  assert.match(body.error, /missing the Wagr Base resolution scope/)
})

test('accepted duel must be marked resolution requested before GenLayer verdict is bridged', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('12'))
  let genlayerReadCount = 0
  let baseSubmitCount = 0

  const app = createRelayerApp({
    config,
    readDuelFromBase: async (_config, chainId, duelId) => createBaseDuel(duelId.toString(), { chainId, status: 'Active' }),
    readResolutionFromGenLayer: async () => {
      genlayerReadCount += 1
      return {
        verdict: createVerdict('YES', 90, '12'),
        genlayerTxHash: validGenLayerTxHash,
      }
    },
    storage,
    submitVerdictToBase: async () => {
      baseSubmitCount += 1
      return baseTxHash
    },
    verdictHash: () => verdictHash,
  })

  const response = await postResolve(app, '12')
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(genlayerReadCount, 0)
  assert.equal(baseSubmitCount, 0)
  assert.match(body.error, /must be marked resolution requested/)
})

test('GenLayer verdict bound to a different duel ID is rejected before Base submission', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('7'))
  let baseSubmitCount = 0

  const app = createRelayerApp({
    config,
    readDuelFromBase: async (_config, chainId, duelId) => createBaseDuel(duelId.toString(), { chainId }),
    readResolutionFromGenLayer: async () => ({
      verdict: createVerdict('YES', 90, '8'),
      genlayerTxHash: validGenLayerTxHash,
    }),
    storage,
    submitVerdictToBase: async () => {
      baseSubmitCount += 1
      return baseTxHash
    },
    verdictHash: () => verdictHash,
  })

  const response = await postResolve(app, '7')
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(baseSubmitCount, 0)
  assert.match(body.error, /different Base duel/)
})

test('GenLayer verdict with mismatched authenticated duel data hash is rejected before Base submission', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata(createMetadata('10'))
  let baseSubmitCount = 0

  const app = createRelayerApp({
    config,
    readDuelFromBase: async (_config, chainId, duelId) => createBaseDuel(duelId.toString(), { chainId }),
    readResolutionFromGenLayer: async () => ({
      verdict: createVerdict('YES', 90, '10', {
        authenticated_duel_data_hash: `0x${'12'.repeat(32)}`,
      }),
      genlayerTxHash: validGenLayerTxHash,
    }),
    storage,
    submitVerdictToBase: async () => {
      baseSubmitCount += 1
      return baseTxHash
    },
    verdictHash: () => verdictHash,
  })

  const response = await postResolve(app, '10')
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(baseSubmitCount, 0)
  assert.match(body.error, /authenticated duel data hash does not match Base/)
})

test('stored metadata hash must match authenticated Base duel metadata hash', async () => {
  const storage = createMemoryStorage()
  await storage.saveMetadata({ ...createMetadata('11'), metadataHash: `0x${'99'.repeat(32)}` })
  let genlayerReadCount = 0
  let baseSubmitCount = 0

  const app = createRelayerApp({
    config,
    readDuelFromBase: async (_config, chainId, duelId) => createBaseDuel(duelId.toString(), { chainId }),
    readResolutionFromGenLayer: async () => {
      genlayerReadCount += 1
      return {
        verdict: createVerdict('YES', 90, '11'),
        genlayerTxHash: validGenLayerTxHash,
      }
    },
    storage,
    submitVerdictToBase: async () => {
      baseSubmitCount += 1
      return baseTxHash
    },
    verdictHash: () => verdictHash,
  })

  const response = await postResolve(app, '11')
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(genlayerReadCount, 0)
  assert.equal(baseSubmitCount, 0)
  assert.match(body.error, /Stored metadata hash does not match/)
})

function createMemoryStorage(): RelayerStorage {
  const metadata = new Map<string, StoredDuelMetadata>()
  const resolutions = new Map<string, StoredResolution>()

  return {
    getMetadata: async (chainId, duelId) => metadata.get(`${chainId}:${duelId}`),
    getResolution: async (chainId, duelId) => resolutions.get(`${chainId}:${duelId}`),
    listMetadata: async (chainId) => {
      const items = [...metadata.values()]
      return chainId ? items.filter((item) => item.chainId === chainId) : items
    },
    saveMetadata: async (item) => {
      metadata.set(`${item.chainId}:${item.duelId}`, item)
      return item
    },
    saveResolution: async (item) => {
      resolutions.set(`${item.chainId}:${item.duelId}`, item)
      return item
    },
  }
}

function createMetadata(duelId: string): StoredDuelMetadata {
  return {
    chainId: baseSepolia.id,
    duelId,
    claim: 'Will the linked public evidence prove the claim before expiry?',
    resolutionRules: 'YES if the claim is proven. NO if it is disproven. INVALID if evidence is inaccessible.',
    evidenceUrls: ['https://example.com'],
    allowedSourceTypes: ['official website'],
    category: 'Test',
    expiryTime: new Date(0).toISOString(),
    creatorSide: 'YES',
    counterpartySide: 'NO',
    metadataHash: `0x${'aa'.repeat(32)}`,
  }
}

function createBaseDuel(duelId: string, overrides: Partial<AuthenticatedDuelData> = {}): AuthenticatedDuelData {
  const data: AuthenticatedDuelData = {
    chainId: baseSepolia.id,
    duelId,
    creator: '0x0000000000000000000000000000000000c0ffee',
    counterparty: '0x000000000000000000000000000000000000d00d',
    creatorSide: 'YES',
    counterpartySide: 'NO',
    stakeAmountWei: '1000000000000000000',
    expiry: '0',
    status: 'ResolutionRequested',
    metadataHash: `0x${'aa'.repeat(32)}`,
    ...overrides,
  }
  return data
}

function createVerdict(
  verdict: GenLayerVerdict['verdict'],
  confidence = verdict === 'UNRESOLVED' ? 0 : 90,
  duelId = '1',
  overrides: Partial<GenLayerVerdict> = {},
): GenLayerVerdict {
  const baseDuel = createBaseDuel(duelId)
  return {
    resolution_scope: WAGR_RESOLUTION_SCOPE,
    duel_id: canonicalGenLayerDuelId(baseDuel.chainId, baseDuel.duelId),
    base_chain_id: baseDuel.chainId,
    base_duel_id: baseDuel.duelId,
    metadata_hash: baseDuel.metadataHash,
    authenticated_duel_data_hash: authenticatedDuelDataHash(baseDuel),
    verdict,
    confidence,
    evidence_summary: `${verdict} summary`,
    sources_checked: [],
    reasoning: `${verdict} reasoning`,
    resolved_at: new Date(0).toISOString(),
    invalid_reason: verdict === 'INVALID' || verdict === 'UNRESOLVED' ? `${verdict} reason` : '',
    ...overrides,
  }
}

function createLegacyVerdict(verdict: GenLayerVerdict['verdict']): GenLayerVerdict {
  return {
    verdict,
    confidence: 90,
    evidence_summary: `${verdict} summary`,
    sources_checked: [],
    reasoning: `${verdict} reasoning`,
    resolved_at: new Date(0).toISOString(),
    invalid_reason: '',
  } as GenLayerVerdict
}

function postResolve(app: ReturnType<typeof createRelayerApp>, duelId: string) {
  return app.request(`/resolve/${duelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chainId: baseSepolia.id, genlayerTxHash: validGenLayerTxHash }),
  })
}
