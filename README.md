# Wagr

PvP prediction battles settled by GenLayer and built on Base.

Wagr is a one-on-one prediction duel app:

- Users create direct YES/NO duels.
- Base holds the stake, escrow, payout, and refund logic.
- GenLayer StudioNet resolves the public-evidence verdict.
- The relayer submits GenLayer YES/NO/INVALID verdicts back to the correct Base escrow contract.

Wagr is not an AMM or order book. Each duel is a matched 1v1 challenge.

## Supported Networks

The Base escrow layer supports both Base Sepolia and Base Mainnet.

| Network | Chain ID | RPC | Escrow contract |
| --- | ---: | --- | --- |
| Base Sepolia | `84532` | `https://sepolia.base.org` | `0xF109bA06578792D624F45a4E67f8aB4f44693D39` |
| Base Mainnet | `8453` | `https://mainnet.base.org` | `0x602d022B9E9c415F399F77d5be69404F2219dc99` |

GenLayer remains on StudioNet for now:

- Network: `StudioNet`
- RPC: `https://studio.genlayer.com/api`
- Explorer: `https://explorer-studio.genlayer.com`
- Resolver: `0x9d0A580Fc57F1F429b00F6c7d20Cf62C2Ba3cceb`

Base Sepolia is the default network for safety. Base Mainnet is selectable in the frontend and uses the deployed mainnet escrow address above for real mainnet duels.

## Local Setup

Install dependencies and verify the workspace:

```bash
npm install
npm run build
npm run contracts:test
npm run relayer:test
```

Run the relayer and frontend in separate terminals:

```bash
npm run dev:relayer
```

```bash
npm run dev:frontend
```

The frontend normally runs at `http://localhost:5173`. The relayer normally runs at `http://localhost:8787`.

Check the relayer:

```bash
curl http://localhost:8787/health
```

## Environment

Copy `.env.example` to `.env` and fill local values. Never commit `.env`; it is ignored by git.

Frontend variables:

```bash
VITE_DEFAULT_CHAIN=baseSepolia
VITE_BASE_SEPOLIA_CHAIN_ID=84532
VITE_BASE_MAINNET_CHAIN_ID=8453
VITE_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
VITE_BASE_MAINNET_RPC_URL=https://mainnet.base.org
VITE_BASE_SEPOLIA_ESCROW_ADDRESS=0xF109bA06578792D624F45a4E67f8aB4f44693D39
VITE_BASE_MAINNET_ESCROW_ADDRESS=0x602d022B9E9c415F399F77d5be69404F2219dc99
VITE_RELAYER_URL=http://localhost:8787
```

Relayer variables:

```bash
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_MAINNET_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_ESCROW_ADDRESS=0xF109bA06578792D624F45a4E67f8aB4f44693D39
BASE_MAINNET_ESCROW_ADDRESS=0x602d022B9E9c415F399F77d5be69404F2219dc99
RELAYER_PRIVATE_KEY=
GENLAYER_NETWORK=studionet
GENLAYER_RPC_URL=https://studio.genlayer.com/api
GENLAYER_EXPLORER_URL=https://explorer-studio.genlayer.com
GENLAYER_RESOLVER_ADDRESS=0x9d0A580Fc57F1F429b00F6c7d20Cf62C2Ba3cceb
RELAYER_PORT=8787
RELAYER_DATA_FILE=.wagr-relayer-data.json
```

Deployment variables:

```bash
DEPLOYER_PRIVATE_KEY=
OWNER_ADDRESS=
WAGR_RESOLVER_ADDRESS=
ETHERSCAN_API_KEY=
```

`WAGR_RESOLVER_ADDRESS` should be the EVM address allowed by the Base escrow contract to submit verdicts. For the current relayer flow, use the wallet address derived from `RELAYER_PRIVATE_KEY`.

## Frontend Network Behavior

The navbar has a Base network selector for:

- Base Sepolia
- Base Mainnet

The selected network controls:

- which Base escrow address is used for reads and writes
- which chain the wallet is asked to switch to
- which explorer links are generated
- which relayer metadata and resolution records are loaded

Base Sepolia displays a Testnet badge. Base Mainnet displays a Mainnet badge and warnings because real funds may be involved.

GenLayer resolution stays on StudioNet regardless of the selected Base network. Sepolia duels keep their existing GenLayer duel ID format. Mainnet GenLayer duel IDs are namespaced with the Base chain ID so mainnet duel `1` cannot collide with Sepolia duel `1`.

## Deployment Registry

Base deployment data lives in:

```bash
deployments/base.json
```

Update this file after a successful Base Mainnet deployment, then set both:

```bash
BASE_MAINNET_ESCROW_ADDRESS=0x...
VITE_BASE_MAINNET_ESCROW_ADDRESS=0x...
```

## Deploy Base Sepolia

Base Sepolia deployment is still supported.

Required `.env` values:

- `DEPLOYER_PRIVATE_KEY`
- `OWNER_ADDRESS`
- `WAGR_RESOLVER_ADDRESS`
- `BASE_SEPOLIA_RPC_URL`

Deploy:

```bash
npm run deploy:base-sepolia
```

After deployment, update:

```bash
BASE_SEPOLIA_ESCROW_ADDRESS=0x...
VITE_BASE_SEPOLIA_ESCROW_ADDRESS=0x...
```

## Prepare Base Mainnet

Do not deploy to Base Mainnet until you have intentionally reviewed the deployer, owner, resolver, contract tests, frontend build, and gas cost.

Run the checks first:

```bash
npm run contracts:test
npm run build
npm run contracts:dry-run:base-mainnet
```

The dry run uses `BASE_MAINNET_RPC_URL` and does not broadcast.

When ready, the deploy command is:

```bash
npm run deploy:base-mainnet
```

That script prompts you to type `DEPLOY BASE MAINNET` before broadcasting. Do not run it with a private key unless you intend to spend real ETH on Base Mainnet gas.

After a successful mainnet deployment:

1. Put the new address in `deployments/base.json`.
2. Set `BASE_MAINNET_ESCROW_ADDRESS` in `.env`.
3. Set `VITE_BASE_MAINNET_ESCROW_ADDRESS` in `.env`.
4. Restart the relayer and frontend.
5. Re-run `npm run build`.

## GenLayer StudioNet

The GenLayer resolver is the deciding layer for Wagr outcomes. The frontend sends the `resolve_duel(...)` transaction to GenLayer StudioNet for the user to sign. The relayer then reads `get_resolution_json(...)` from GenLayer and submits YES/NO/INVALID verdicts to the selected Base chain.

UNRESOLVED GenLayer results are not submitted to Base.

Check the resolver schema:

```bash
npm run genlayer:schema
```

Deploy the resolver only if the GenLayer contract changes:

```bash
npm run genlayer:deploy
```

The current dual-network upgrade does not require changing or redeploying the GenLayer resolver.
