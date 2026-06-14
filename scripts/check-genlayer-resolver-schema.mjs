import { readFileSync } from 'node:fs'
import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'

const contractPath = new URL('../genlayer/contracts/wagr_resolver.py', import.meta.url)
const contractCode = readFileSync(contractPath, 'utf8')
const client = createClient({ chain: studionet })

const schema = await client.getContractSchemaForCode(contractCode)
console.log(JSON.stringify(schema, null, 2))
