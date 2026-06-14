#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

: "${BASE_MAINNET_RPC_URL:=https://mainnet.base.org}"
: "${DEPLOYER_PRIVATE_KEY:?Set DEPLOYER_PRIVATE_KEY in .env}"
: "${OWNER_ADDRESS:?Set OWNER_ADDRESS in .env}"
: "${WAGR_RESOLVER_ADDRESS:?Set WAGR_RESOLVER_ADDRESS in .env}"

if [[ ! "$DEPLOYER_PRIVATE_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  echo "DEPLOYER_PRIVATE_KEY must be a 32-byte 0x-prefixed private key" >&2
  exit 1
fi

if [[ ! "$OWNER_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "OWNER_ADDRESS must be a valid 0x-prefixed EVM address" >&2
  exit 1
fi

if [[ ! "$WAGR_RESOLVER_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "WAGR_RESOLVER_ADDRESS must be a valid 0x-prefixed EVM address" >&2
  exit 1
fi

echo "WARNING: this will deploy WagrDuelEscrow to Base Mainnet using real ETH for gas."
read -r -p "Type DEPLOY BASE MAINNET to continue: " confirmation
if [ "$confirmation" != "DEPLOY BASE MAINNET" ]; then
  echo "Canceled."
  exit 1
fi

cmd=(
  forge script
  script/DeployWagrDuelEscrow.s.sol:DeployWagrDuelEscrow
  --rpc-url "$BASE_MAINNET_RPC_URL"
  --broadcast
)

if [ -n "${ETHERSCAN_API_KEY:-}" ]; then
  cmd+=(--verify --etherscan-api-key "$ETHERSCAN_API_KEY")
fi

cd contracts/base
"${cmd[@]}"
