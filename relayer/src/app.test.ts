import { baseSepolia, type BaseChainId, type GenLayerVerdict } from '@wagr/shared'
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

test('UNRESOLVED does not submit a verdict to Base', async () => {
  const storage = createMemoryStorage()
  storage.saveMetadata(createMetadata('1'))
  let baseSubmitCount = 0

  const app = createRelayerApp({
    config,
    readResolutionFromGenLayer: async () => ({
      verdict: createVerdict('UNRESOLVED'),
      genlayerTxHash: validGenLayerTxHash,
    }),
    storage,
    submitVerdictToBase: async () => {
      baseSubmitCount += 1
      return baseTxHash
    },
    verdictHash: () => verdictHash,
  })

  const response = await postResolve(app, '1')
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(baseSubmitCount, 0)
  assert.equal(body.baseSubmitted, false)
  assert.equal(body.baseTxHash, undefined)
  assert.match(body.baseSubmitError, /UNRESOLVED/)
  assert.match(body.nextStep, /retried/)
  assert.equal(storage.getResolution(baseSepolia.id, '1')?.baseSubmitted, false)
})

test('YES and NO verdicts submit to Base', async (t) => {
  for (const verdict of ['YES', 'NO'] as const) {
    await t.test(`${verdict} submits`, async () => {
      const storage = createMemoryStorage()
      storage.saveMetadata(createMetadata('7'))
      const submitted: Array<{ chainId: BaseChainId; duelId: bigint; verdict: string; confidence: number; hash: `0x${string}` }> = []

      const app = createRelayerApp({
        config,
        readResolutionFromGenLayer: async () => ({
          verdict: createVerdict(verdict, 92),
          genlayerTxHash: validGenLayerTxHash,
        }),
        storage,
        submitVerdictToBase: async (_config, chainId, duelId, submittedVerdict, confidence, hash) => {
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
      assert.equal(storage.getResolution(baseSepolia.id, '7')?.verdict.verdict, verdict)
    })
  }
})

test('bad GenLayer transaction hash returns a clean error', async () => {
  const storage = createMemoryStorage()
  storage.saveMetadata(createMetadata('3'))
  let readCalled = false

  const app = createRelayerApp({
    config,
    readResolutionFromGenLayer: async () => {
      readCalled = true
      return { verdict: createVerdict('YES') }
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
  storage.saveMetadata(createMetadata('5'))
  let baseSubmitCount = 0

  const app = createRelayerApp({
    config,
    readResolutionFromGenLayer: async () => ({
      verdict: createVerdict('YES'),
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
  storage.saveMetadata(createMetadata('6'))
  let baseSubmitCount = 0

  const app = createRelayerApp({
    config,
    readResolutionFromGenLayer: async () => ({
      verdict: createVerdict('YES'),
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
  storage.saveMetadata(createMetadata('4'))
  let baseSubmitCount = 0

  const app = createRelayerApp({
    config,
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

function createMemoryStorage(): RelayerStorage {
  const metadata = new Map<string, StoredDuelMetadata>()
  const resolutions = new Map<string, StoredResolution>()

  return {
    getMetadata: (chainId, duelId) => metadata.get(`${chainId}:${duelId}`),
    getResolution: (chainId, duelId) => resolutions.get(`${chainId}:${duelId}`),
    listMetadata: (chainId) => {
      const items = [...metadata.values()]
      return chainId ? items.filter((item) => item.chainId === chainId) : items
    },
    saveMetadata: (item) => {
      metadata.set(`${item.chainId}:${item.duelId}`, item)
      return item
    },
    saveResolution: (item) => {
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
    expiryTime: new Date(Date.now() - 60_000).toISOString(),
    creatorSide: 'YES',
    counterpartySide: 'NO',
    metadataHash: `0x${'00'.repeat(32)}`,
  }
}

function createVerdict(verdict: GenLayerVerdict['verdict'], confidence = verdict === 'UNRESOLVED' ? 0 : 90): GenLayerVerdict {
  return {
    verdict,
    confidence,
    evidence_summary: `${verdict} summary`,
    sources_checked: [],
    reasoning: `${verdict} reasoning`,
    resolved_at: new Date(0).toISOString(),
    invalid_reason: verdict === 'INVALID' || verdict === 'UNRESOLVED' ? `${verdict} reason` : '',
  }
}

function postResolve(app: ReturnType<typeof createRelayerApp>, duelId: string) {
  return app.request(`/resolve/${duelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chainId: baseSepolia.id, genlayerTxHash: validGenLayerTxHash }),
  })
}
