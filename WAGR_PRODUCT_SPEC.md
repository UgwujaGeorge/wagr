# Wagr Product Spec

## Product Summary

Wagr is a testnet-only PvP prediction battle platform for claims that require judgment, public evidence, and language interpretation. It is not a general prediction market, not an AMM, not an order book, and not a liquidity venue.

Tagline:

> PvP prediction battles resolved by GenLayer.

The MVP is a simple duel:

1. One user creates a challenge.
2. One counterparty accepts the opposite side.
3. Both users deposit the same stake on Base Sepolia.
4. After expiry, GenLayer resolves the claim using public evidence, AI reasoning, and validator consensus.
5. A minimal relayer submits the final verdict to the Base escrow contract.
6. The winner claims the pot, or both users are refunded if the claim is invalid or unresolved.

## Source Inputs

- GenLayer docs: https://docs.genlayer.com/
- GenLayer typical use cases: https://docs.genlayer.com/understand-genlayer-protocol/typical-use-cases
- GenLayer Studio: https://docs.genlayer.com/developers/intelligent-contracts/tools/genlayer-studio
- GenLayer Intelligent Contracts: https://docs.genlayer.com/developers/intelligent-contracts/introduction
- GenLayer networks: https://docs.genlayer.com/developers/networks
- Base docs: https://docs.base.org/
- Base Sepolia network config: chain ID `84532`, RPC `https://sepolia.base.org`, explorer `https://sepolia.basescan.org`
- Local GenLayer research:
  - `/home/jayne/projects/genlayerprojects/first/genlayer-docs-research/GENLAYER_FULL_DOCUMENTATION.md`
  - `/home/jayne/projects/genlayerprojects/first/genlayer-docs-research/GENLAYER_APP_IDEAS.md`
  - `/home/jayne/projects/genlayerprojects/first/genlayer-docs-research/WHAT_I_LEARNED_ABOUT_GENLAYER.md`

## Positioning

Wagr is for "one claim, two sides, one winner" battles where the result is not best handled by a simple price feed.

Good Wagr claims:

- "Will this project launch its testnet before July 31?"
- "Will this memecoin team ship staking before Friday?"
- "Will this AI agent complete the posted task?"
- "Will this protocol's website stay online for 24 hours?"
- "Will this founder's public claim be confirmed by an official source?"
- "Will this GitHub issue be fixed before the deadline?"
- "Will this creator publish the required post before the deadline?"

Weak Wagr claims:

- "Will ETH be above $X tomorrow?"
- "Will token Y pump 10%?"
- "Will this wallet trade profitably?"

Those are mostly price-oracle or trading problems. Wagr should focus on claims that require public-source verification, evidence review, screenshots, natural-language interpretation, or source credibility judgment.

## MVP User Flow

1. User connects wallet on Base Sepolia.
2. User creates a duel with:
   - Claim/question
   - Resolution rules
   - Allowed evidence URLs or source types
   - Expiry time
   - Stake amount
   - Creator side: YES or NO
3. Creator deposits their stake into the Base escrow contract.
4. Another wallet accepts the opposite side and deposits the same stake.
5. Duel becomes active.
6. After expiry, anyone can trigger resolution.
7. The backend/relayer sends the duel metadata to the GenLayer Intelligent Contract.
8. GenLayer fetches public evidence and returns a structured verdict.
9. Relayer submits the verdict to the Base escrow contract.
10. Winner claims the pot.
11. If verdict is INVALID or UNRESOLVED, both users claim refunds.

## MVP Scope

Build only:

- Base Sepolia wallet connection.
- ETH-denominated testnet staking first.
- One Base escrow contract.
- One GenLayer Intelligent Contract for claim resolution.
- One minimal relayer service.
- Vite + React frontend.
- One-to-one duels.
- YES/NO sides.
- INVALID/UNRESOLVED refund path.
- Events for frontend indexing.
- Simple local metadata storage if needed.

Defer:

- USDC until ETH flow is stable.
- Mainnet.
- Legal/gambling language.
- Order books.
- AMMs.
- Multiple counterparties.
- Partial fills.
- Odds pricing.
- Protocol fees.
- Dispute UI.
- Appeals UI.
- Token launch.
- Social feeds.

## Product States

| State | Meaning |
|---|---|
| Draft | User is filling out the create form before wallet transaction. |
| Open | Creator deposited; waiting for one counterparty. |
| Active | Counterparty deposited; duel is locked until expiry. |
| Expired | Time has passed; resolution can be triggered. |
| Resolving | GenLayer evaluation is in progress. |
| Resolved | Verdict is YES or NO; winner can claim. |
| Invalid | GenLayer found the claim invalid or unresolved; both sides can refund. |
| Paid | Payout or refunds are complete. |
| Canceled | Open duel was canceled before acceptance. |

## Challenge Creation Rules

The frontend should guide users toward resolvable claims.

Required fields:

- Claim: one sentence, phrased as a YES/NO proposition.
- Resolution rules: objective criteria for YES and NO.
- Expiry: future timestamp.
- Evidence: 1 to 5 public URLs or allowed source types.
- Stake: ETH amount on Base Sepolia.
- Side: YES or NO.

Validation copy:

- "Use public evidence. Avoid private chats, unverifiable rumors, and token price-only claims."
- "Wagr is a testnet demo. Do not use real-money claims."
- "The resolver can return INVALID if the claim is ambiguous, sources are unavailable, or evidence is insufficient."

## Example Duel

Claim:

> Will Project Atlas publish a public testnet launch announcement before July 31, 2026 23:59 UTC?

Rules:

- YES if an official Project Atlas website, docs page, GitHub release, or verified social account publicly announces that testnet is live before the expiry time.
- NO if no allowed source confirms public testnet launch by expiry.
- INVALID if official sources are unreachable or the claim cannot be resolved from public evidence.

Evidence URLs:

- Official website
- Official docs
- GitHub releases
- Public announcement page

Stake:

- 0.01 testnet ETH each

## Success Criteria

The MVP is successful if a demo user can:

1. Create a PvP duel.
2. Accept the opposite side.
3. See funds locked on Base Sepolia.
4. Trigger resolution after expiry.
5. See a GenLayer verdict with evidence summary and reasoning.
6. Claim payout or refund from the Base escrow.

## Safety and Compliance Tone

Use testnet-only language:

- "Prediction duel demo"
- "Testnet challenge"
- "Experimental resolution"
- "No real-money markets"

Avoid:

- "Casino"
- "Betting"
- "Guaranteed winnings"
- "Real-money wagers"
- "Financial advice"

## Recommended First Demo

Use a claim with controlled public evidence:

> Will this GitHub issue be closed before the expiry time?

Why:

- Evidence is public.
- The UI can show the issue URL.
- GenLayer can fetch the page/API and reason over status.
- It is more GenLayer-native than a price claim.
- It is easier to demo than social posts that may block scraping.

