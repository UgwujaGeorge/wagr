#!/usr/bin/env node
// Regenerates shared/src/abi/wagrDuelEscrowAbi.ts from the compiled artifact so
// the relayer and frontend can never drift from the deployed contract shape.
import { readFileSync, writeFileSync } from 'node:fs'

const artifact = JSON.parse(
  readFileSync(new URL('../contracts/base/out/WagrDuelEscrow.sol/WagrDuelEscrow.json', import.meta.url), 'utf8'),
)
const header =
  '// Generated from contracts/base/out/WagrDuelEscrow.sol/WagrDuelEscrow.json. Do not edit by hand.\n' +
  '// Regenerate with: npm run contracts:abi\n\nexport const wagrDuelEscrowAbi = '
writeFileSync(
  new URL('../shared/src/abi/wagrDuelEscrowAbi.ts', import.meta.url),
  `${header}${JSON.stringify(artifact.abi, null, 2)} as const\n`,
)
console.log(`wrote ${artifact.abi.length} ABI entries`)
