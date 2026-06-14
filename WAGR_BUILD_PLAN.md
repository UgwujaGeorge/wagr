# Wagr Build Plan

## Build Strategy

Build Wagr in thin vertical slices. The first working version should prove the complete loop:

Base escrow -> accepted duel -> expired duel -> GenLayer verdict -> Base payout.

Do not optimize for liquidity, scale, or production trustlessness until the MVP loop works.

## Phase 0: Planning and Setup

Deliverables:

- Product spec.
- Architecture plan.
- Contract design.
- GenLayer resolution design.
- Frontend design.
- First 20 implementation tasks.

Rules:

- No deploys.
- No private keys.
- No GitHub push.
- No mainnet.

## Phase 1: Local Project Scaffold

Deliverables:

- Monorepo structure.
- Vite + React + TypeScript frontend.
- Foundry Solidity workspace.
- GenLayer contract folder.
- Relayer folder.
- Shared ABI/types folder.

Acceptance criteria:

- `frontend` starts locally.
- `contracts/base` tests run locally.
- No environment secrets committed.

## Phase 2: Base Escrow Contract

Implement:

- `createDuel`
- `acceptDuel`
- `cancelOpenDuel`
- `submitVerdict`
- `claimPayout`
- `claimRefund`
- Events.
- ETH deposits first.

Test:

- Creator deposits correct stake.
- Counterparty must deposit same stake.
- Creator cannot accept own duel.
- Opposite side is enforced.
- Cannot resolve before expiry.
- Only resolver can submit verdict.
- YES pays YES player.
- NO pays NO player.
- INVALID refunds both.
- Cannot double claim.

## Phase 3: GenLayer Resolver Contract

Implement:

- Store or accept resolution request fields.
- Fetch evidence URLs inside nondeterministic block.
- Use LLM prompt for structured JSON.
- Validate output schema.
- Compare verdict fields across validators.
- Return structured verdict.

Test:

- YES claim resolves YES with controlled evidence.
- NO claim resolves NO with controlled evidence.
- Ambiguous claim resolves INVALID/UNRESOLVED.
- Prompt injection from source text does not override system criteria.
- Missing evidence returns INVALID/UNRESOLVED.

## Phase 4: Relayer

Implement:

- Read duel from Base.
- Read offchain metadata if needed.
- Trigger GenLayer resolver after expiry.
- Poll/receive GenLayer verdict.
- Submit compact verdict to Base.
- Store full verdict JSON for frontend display.

Keep it minimal:

- One process.
- One authorized resolver key.
- No queue unless needed.
- No admin dashboard.
- No generalized job engine.

## Phase 5: Frontend MVP

Build pages:

1. Landing page.
2. Explore duels page.
3. Create duel page.
4. Duel detail page.
5. My duels page.
6. Resolution/result page.

Core UI:

- Wallet connect.
- Base Sepolia network guard.
- Create form.
- YES/NO side buttons.
- Duel cards.
- Countdown timers.
- Evidence panel.
- Verdict panel.
- Claim payout/refund buttons.

## Phase 6: End-to-End Testnet Demo

Demo script:

1. Connect wallet on Base Sepolia.
2. Create a controlled duel with short expiry.
3. Accept from second wallet.
4. Wait until expiry.
5. Trigger resolution.
6. Show GenLayer verdict.
7. Submit verdict to Base.
8. Claim payout or refund.
9. Show Base Sepolia transaction.

## Phase 7: Polish

Polish only after the loop works:

- Better loading states.
- Better copy.
- Explorer links.
- Shareable duel URL.
- Example claim templates.
- Better empty states.
- Error recovery.
- Responsive mobile layout.

## Recommended Implementation Order

1. Base escrow contract tests.
2. Base escrow contract implementation.
3. Frontend static screens.
4. Wallet connect and Base reads.
5. Create/accept transactions.
6. GenLayer resolver prototype.
7. Relayer prototype.
8. End-to-end resolution.
9. UI verdict display.
10. Polish and demo prep.

## Testing Plan

Base contract:

- Unit tests in Foundry.
- State transition tests.
- Fuzz basic stake amounts and expiry values.
- Reentrancy and double-claim checks.

GenLayer:

- Direct mode tests for parsing and validation.
- Studio/StudioNet integration for real nondeterminism.
- Controlled evidence fixtures.

Relayer:

- Mock Base reads.
- Mock GenLayer verdicts.
- Test idempotent retry of `submitVerdict`.

Frontend:

- Component tests later if time allows.
- Manual testnet walkthrough first.

## Demo Claim Templates

Use easy public evidence:

1. GitHub issue closure:
   - "Will GitHub issue X be closed before the deadline?"
2. Website uptime:
   - "Will this website show an operational status at expiry?"
3. Creator delivery:
   - "Will this creator publish the required post before the deadline?"
4. Project launch:
   - "Will this project publish a testnet launch announcement before the deadline?"

Start with GitHub issue closure because it is stable and public.

## What Not To Build In Version 1

- No Polymarket clone.
- No order book.
- No AMM.
- No market making.
- No liquidity pools.
- No odds engine.
- No price feeds.
- No mainnet.
- No real-money claims.
- No multi-party challenges.
- No social graph.
- No comments.
- No token.
- No referral system.
- No mobile app.
- No push notifications.

## Definition of Done For MVP

Wagr MVP is done when:

- A user can create a duel on Base Sepolia.
- A second user can accept it.
- Both stakes are escrowed.
- After expiry, GenLayer returns a structured verdict.
- The relayer submits verdict to Base.
- Winner can claim pot, or both users can refund on INVALID.
- The frontend clearly shows state, evidence, and verdict.

