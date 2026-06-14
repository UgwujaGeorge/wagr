import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { createAccount, createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { TransactionStatus } from 'genlayer-js/types'
import { formatEther } from 'viem'

const privateKey = process.env.GENLAYER_ACCOUNT_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY
if (!privateKey) {
  throw new Error('Set GENLAYER_ACCOUNT_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env before deploying to GenLayer')
}

const account = createAccount(privateKey)
const client = createClient({
  chain: studionet,
  endpoint: process.env.GENLAYER_RPC_URL || studionet.rpcUrls.default.http[0],
  account,
})

const balanceHex = await client.request({ method: 'eth_getBalance', params: [account.address, 'latest'] })
const balance = BigInt(balanceHex)

const contractPath = new URL('../genlayer/contracts/wagr_resolver.py', import.meta.url)
const contractCode = new Uint8Array(readFileSync(contractPath))

console.log(`Deploying WagrResolver to GenLayer StudioNet from ${account.address}`)
console.log(`StudioNet GEN balance: ${formatEther(balance)}`)

const txHash = await client.deployContract({
  code: contractCode,
  args: [],
})

const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: TransactionStatus.ACCEPTED,
  interval: 5_000,
  retries: 200,
})

const receiptStatusName =
  typeof receipt.statusName === 'string'
    ? receipt.statusName
    : typeof receipt.status_name === 'string'
      ? receipt.status_name
      : undefined

if (![TransactionStatus.ACCEPTED, TransactionStatus.FINALIZED].includes(receiptStatusName)) {
  const statusLabel = receiptStatusName ?? receipt.status ?? 'unknown'
  throw new Error(`Deployment did not reach an accepted state. Status: ${statusLabel}`)
}

const decoded = receipt.txDataDecoded
const contractAddress =
  typeof receipt.data?.contract_address === 'string'
    ? receipt.data.contract_address
    : decoded && 'contractAddress' in decoded
      ? decoded.contractAddress
      : undefined

if (!contractAddress) {
  throw new Error('Deployment succeeded but no contract address was found in the receipt')
}

console.log(`GenLayer resolver transaction: ${txHash}`)
console.log(`GenLayer resolver address: ${contractAddress}`)
console.log('Set GENLAYER_RESOLVER_ADDRESS to this address in .env, then restart the relayer.')
