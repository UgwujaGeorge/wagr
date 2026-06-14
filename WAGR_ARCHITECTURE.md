# Wagr Architecture

## High-Level Architecture

Wagr has four parts:

1. **Base Sepolia escrow contract**
   - Holds the duel stakes.
   - Tracks duel lifecycle.
   - Pays winner or refunds both sides.
   - Emits events for indexing.

2. **GenLayer Intelligent Contract**
   - Receives claim metadata and evidence URLs.
   - Fetches public evidence.
   - Uses LLM reasoning and validator consensus.
   - Produces a structured verdict.

3. **Minimal relayer/backend**
   - Watches expired duels.
   - Calls the GenLayer resolver.
   - Waits for GenLayer result/finality where practical.
   - Submits the verdict to the Base escrow contract.
   - Stores optional metadata for frontend convenience.

4. **Vite + React frontend**
   - Wallet connection on Base Sepolia.
   - Duel creation and acceptance.
   - Explore, my duels, detail, and resolution views.
   - Reads Base events and optional backend metadata.

## Why Base

Base is used for the escrow and settlement layer:

- Cheap, fast EVM transactions.
- Strong wallet support.
- Base Sepolia is suitable for testnet-only MVP work.
- Solidity escrow logic is simple and auditable.
- Frontend users can connect with common EVM wallets.

MVP network:

| Property | Value |
|---|---|
| Network | Base Sepolia |
| Chain ID | `84532` |
| RPC | `https://sepolia.base.org` |
| Currency | ETH |
| Explorer | `https://sepolia.basescan.org` |

Use public RPC only for early demos. For production, use a dedicated RPC provider or backend proxy.

## Why GenLayer

GenLayer is used for subjective, evidence-based resolution:

- Intelligent Contracts can use web data and LLMs.
- Validators independently evaluate non-deterministic outputs.
- The Equivalence Principle lets the app define what counts as an equivalent verdict.
- It can interpret natural-language rules, public webpages, screenshots, and structured evidence.

Wagr should not use GenLayer for simple deterministic price movements. It should use GenLayer where a normal contract or price oracle is not enough.

## Why Vite React

Use Vite + React because Wagr is a client-heavy SPA:

- Fast local development.
- Simple wallet integration.
- No server-side rendering needed for the MVP.
- Easy routing for landing, explore, create, detail, and result pages.
- Better fit than Next.js for a testnet dApp prototype with minimal backend.

## Network Roles

| Layer | Role | Trust Model in MVP |
|---|---|---|
| Base Sepolia | Escrow and payouts | Trust-minimized once contract is deployed. |
| GenLayer StudioNet/testnet | Claim adjudication | Validator consensus on GenLayer side. |
| Relayer | Bridges GenLayer verdict to Base | Centralized in MVP. |
| Frontend | User interaction | Untrusted display layer. |

## Base and GenLayer Communication

In the MVP, the Base contract and GenLayer contract do not communicate directly.

Flow:

1. Base emits `DuelAccepted`.
2. After expiry, frontend or backend calls `requestResolution(duelId)` on the relayer API or directly triggers the relayer process.
3. Relayer reads duel metadata from Base and metadata storage.
4. Relayer calls the GenLayer Intelligent Contract with the claim, rules, expiry, sides, and evidence URLs.
5. GenLayer returns a structured verdict.
6. Relayer submits `submitVerdict(duelId, verdict, confidence, evidenceHash, reasoningHash)` to the Base contract.
7. Base contract validates caller is authorized resolver and updates payout state.

This is the simplest architecture. It is not fully trustless because the relayer is trusted to submit the GenLayer verdict accurately.

## Trust-Minimized vs Centralized

Trust-minimized in MVP:

- Escrow funds are held by a Base smart contract.
- Creator and counterparty deposits are enforced onchain.
- Payout/refund logic is deterministic.
- Duel lifecycle is evented onchain.
- Users can inspect Base state.

Centralized in MVP:

- The relayer is authorized to submit verdicts.
- Metadata may be stored offchain if the claim/rules/evidence are too large.
- The frontend may rely on backend indexing for convenience.
- The MVP does not cryptographically prove the GenLayer verdict on Base.

Later improvements:

- Multiple relayers with threshold signatures.
- Store GenLayer transaction IDs and finality status on Base.
- Optimistic resolution challenge window on Base.
- Onchain hash commitments for claim metadata.
- A canonical resolver registry.
- Decentralized metadata storage with IPFS/Arweave.
- Direct cross-chain proof or messaging if GenLayer/Base tooling supports it later.

## Recommended Tech Stack

Frontend:

- Vite
- React
- TypeScript
- React Router
- wagmi
- viem
- Tailwind CSS
- TanStack Query
- date-fns or dayjs
- lucide-react for icons

Base contracts:

- Solidity
- Foundry
- OpenZeppelin for ownership, reentrancy guard, safe ERC20 if mock USDC is added
- ETH deposits first
- Mock USDC optional after ETH flow

GenLayer:

- Python Intelligent Contract
- GenLayer StudioNet or testnet
- GenLayer SDK/CLI as needed
- Structured JSON verdicts
- `run_nondet_unsafe` with custom validator logic

Backend/relayer:

- Node.js + TypeScript
- Express or Hono
- viem for Base reads/writes
- GenLayer JS or Python SDK, whichever is more reliable for current tooling
- SQLite or Postgres optional
- Pino logging

## Suggested Folder Structure

```text
wagr/
  docs/
    WAGR_PRODUCT_SPEC.md
    WAGR_ARCHITECTURE.md
    WAGR_BUILD_PLAN.md
    WAGR_CONTRACT_DESIGN.md
    WAGR_GENLAYER_RESOLUTION_DESIGN.md
    WAGR_FRONTEND_DESIGN.md
  contracts/
    base/
      src/
        WagrDuelEscrow.sol
      test/
      script/
  genlayer/
    contracts/
      wagr_resolver.py
    tests/
  frontend/
    src/
      app/
      components/
      pages/
      hooks/
      lib/
      styles/
  relayer/
    src/
      index.ts
      base.ts
      genlayer.ts
      resolution.ts
      storage.ts
  shared/
    types/
    abi/
    constants/
```

The planning files currently live at the repository root requested by the user. When implementation starts, move or copy them into `docs/` if useful.

## Environment Variables

Do not create real keys in planning.

Frontend:

```text
VITE_BASE_CHAIN_ID=84532
VITE_BASE_RPC_URL=https://sepolia.base.org
VITE_WAGR_ESCROW_ADDRESS=
VITE_RELAYER_URL=http://localhost:8787
VITE_GENLAYER_EXPLORER_URL=
```

Relayer:

```text
BASE_SEPOLIA_RPC_URL=
BASE_ESCROW_ADDRESS=
RELAYER_PRIVATE_KEY=
GENLAYER_RPC_URL=https://studio.genlayer.com/api
GENLAYER_RESOLVER_ADDRESS=
GENLAYER_ACCOUNT_PRIVATE_KEY=
DATABASE_URL=
```

Contract deployment:

```text
BASESCAN_API_KEY=
DEPLOYER_PRIVATE_KEY=
BASE_SEPOLIA_RPC_URL=
```

Never commit `.env` files. Never expose private keys in frontend code.

## Data Model

Base onchain duel:

- `duelId`
- `creator`
- `counterparty`
- `creatorSide`
- `stakeAmount`
- `expiry`
- `status`
- `verdict`
- `winner`
- `metadataHash`
- `resolver`
- `createdAt`
- `acceptedAt`
- `resolvedAt`

Offchain metadata:

- `duelId`
- `claim`
- `resolutionRules`
- `evidenceUrls`
- `allowedSourceTypes`
- `displayCategory`
- `createdAt`
- `genLayerTxId`
- `verdictJson`
- `reasoning`
- `sourcesChecked`

Hashing:

- The Base contract should store a `metadataHash`.
- The frontend/relayer computes `keccak256` over normalized claim metadata.
- The relayer sends the same metadata to GenLayer.
- The verdict submitted back to Base should include a `verdictHash` or `evidenceHash` event so users can connect Base payout to the GenLayer result.

## Event Indexing

Base events:

- `DuelCreated`
- `DuelAccepted`
- `DuelCanceled`
- `ResolutionRequested`
- `VerdictSubmitted`
- `PayoutClaimed`
- `RefundClaimed`

The frontend can start by querying contract events with viem. If event querying becomes slow, the relayer can maintain a small indexed cache.

## Demo Architecture

For a hackathon demo:

1. Run frontend locally.
2. Use Base Sepolia.
3. Use one deployed Wagr escrow contract.
4. Use one deployed GenLayer resolver on StudioNet/testnet.
5. Run relayer locally or on a small server.
6. Use controlled public evidence URLs.
7. Show Base explorer transaction and GenLayer verdict panel.

## Avoiding MVP Overcomplication

Do not build:

- Market pages with odds curves.
- Share tokens.
- Partial fills.
- Creator-set odds.
- Liquidity pools.
- Multi-outcome markets.
- Price feeds.
- Complex appeal bonding.
- Mainnet deployment.
- Token rewards.
- AI agents that create markets automatically.

Build only:

- Duel creation.
- Duel acceptance.
- Expiry.
- Resolution.
- Winner payout or refund.

