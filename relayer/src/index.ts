import { serve } from '@hono/node-server'
import { createRelayerApp } from './app.js'
import { submitVerdictToBase, verdictHash } from './base.js'
import { loadConfig } from './config.js'
import { readResolutionFromGenLayer } from './genlayer.js'
import { getMetadata, getResolution, listMetadata, saveMetadata, saveResolution } from './storage.js'

const config = loadConfig()
const app = createRelayerApp({
  config,
  readResolutionFromGenLayer,
  storage: {
    getMetadata,
    getResolution,
    listMetadata,
    saveMetadata,
    saveResolution,
  },
  submitVerdictToBase,
  verdictHash,
})

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`Wagr relayer listening on port ${info.port}`)
  },
)
