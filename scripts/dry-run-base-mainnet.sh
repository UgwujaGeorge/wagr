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

cd contracts/base
forge script script/DeployWagrDuelEscrow.s.sol:DeployWagrDuelEscrow --rpc-url "$BASE_MAINNET_RPC_URL"
