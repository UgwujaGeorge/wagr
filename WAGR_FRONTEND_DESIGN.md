# Wagr Frontend Design

## Frontend Stack

- Vite
- React
- TypeScript
- React Router
- wagmi
- viem
- Tailwind CSS
- TanStack Query
- lucide-react
- date-fns or dayjs

Do not use Next.js for MVP. Wagr does not need server-rendered routes, SEO-heavy content, or API routes in the frontend app.

## Design Direction

Wagr should feel like a sharp crypto-native PvP terminal:

- Dark mode by default.
- Competitive trading-terminal energy.
- Clean dense layouts.
- Bright YES/NO contrast.
- Large stake displays.
- Countdown timers.
- Evidence and verdict panels.
- Clear wallet/network state.

Palette:

- Background: near-black `#070A0F`
- Surface: graphite `#10151F`
- Raised panels: `#151C29`
- Borders: cool gray `#263244`
- YES: electric green `#35F28F`
- NO: hot red `#FF4D6D`
- Warning/expiry: amber `#FFB020`
- GenLayer/verdict accent: cyan `#35D5FF`
- Secondary accent: violet `#8B5CF6`

Avoid a single-hue palette. Use green/red/cyan/amber for functional states.

## Pages

### 1. Landing Page

Purpose:

- Explain Wagr in one screen.
- Let user connect wallet.
- Push user to Explore or Create.

Sections:

- Header with logo, wallet button, network chip.
- Hero: "PvP prediction battles resolved by GenLayer."
- Live stats strip: open duels, active pot, resolved duels.
- Featured duels preview.
- How it works: Create, Accept, Resolve, Claim.

Primary CTA:

- Create Duel

Secondary CTA:

- Explore Duels

### 2. Explore Duels Page

Purpose:

- Browse open and active duels.

Components:

- Filter tabs: Open, Active, Expired, Resolved.
- Search by claim.
- Category chips: GitHub, Launch, Creator, Uptime, Protocol Claim.
- Duel cards.

Duel card fields:

- Claim.
- Creator side.
- Stake.
- Pot.
- Expiry countdown.
- Evidence count.
- Status.
- Accept button if open.

### 3. Create Duel Page

Purpose:

- Create a clean, resolvable duel.

Fields:

- Claim/question.
- Resolution rules.
- Evidence URLs.
- Allowed source types.
- Expiry date/time.
- Stake amount.
- Creator side YES/NO.

UX requirements:

- Show "Good claim" guidance inline.
- Show warnings for vague claims.
- Reject empty evidence URLs.
- Show metadata hash preview.
- Show estimated flow: deposit on Base, wait for accept, resolve after expiry.

### 4. Duel Detail Page

Purpose:

- Single source of truth for one duel.

Panels:

- Claim header.
- YES/NO matchup.
- Stake and pot.
- Participants.
- Status timeline.
- Countdown.
- Evidence panel.
- Resolution rules.
- Action panel:
  - Accept.
  - Cancel if open creator.
  - Request resolution if expired.
  - Claim payout.
  - Claim refund.

### 5. My Duels Page

Purpose:

- Show duels involving connected wallet.

Tabs:

- Created.
- Accepted.
- Won.
- Lost.
- Refundable.
- Action needed.

### 6. Resolution/Result Page

Purpose:

- Make GenLayer's adjudication visible.

Panels:

- Verdict: YES, NO, INVALID, or UNRESOLVED.
- Confidence score.
- Winner/refund state.
- Evidence summary.
- Sources checked.
- Reasoning.
- GenLayer transaction/result reference.
- Base verdict transaction reference.

## Core Components

- `AppShell`
- `TopNav`
- `WalletButton`
- `NetworkGuard`
- `DuelCard`
- `SideBadge`
- `StakeDisplay`
- `Countdown`
- `EvidenceList`
- `VerdictPanel`
- `DuelTimeline`
- `CreateDuelForm`
- `ActionPanel`
- `TransactionToast`
- `EmptyState`

## Frontend State Flow

Create duel:

```text
idle
  -> validate form
  -> compute metadata hash
  -> wallet confirms createDuel
  -> tx pending
  -> duel open
```

Accept duel:

```text
open duel
  -> wallet confirms acceptDuel
  -> tx pending
  -> active duel
```

Resolve duel:

```text
expired duel
  -> request resolution
  -> relayer accepted job
  -> GenLayer resolving
  -> verdict available
  -> relayer submits Base verdict
  -> payout/refund available
```

Claim payout:

```text
resolved duel
  -> winner wallet confirms claimPayout
  -> tx pending
  -> paid
```

Refund:

```text
invalid duel
  -> wallet confirms claimRefund
  -> tx pending
  -> refunded
```

## Wallet UX

Requirements:

- Detect wallet.
- Require Base Sepolia.
- Show chain mismatch state.
- Provide switch network action.
- Show shortened address.
- Show testnet ETH balance.

Use Base Sepolia:

- Chain ID: `84532`
- RPC: `https://sepolia.base.org`
- Explorer: `https://sepolia.basescan.org`

## Visual Rules

- Cards can be used for duels and panels.
- Keep cards sharp: max `8px` radius.
- Use clear icon buttons where appropriate.
- Do not put cards inside cards.
- Do not use marketing-style oversized decorative sections beyond the landing hero.
- Use stable dimensions for duel cards, side buttons, timers, and stake displays.
- Text must fit on mobile and desktop.

## Example Duel Card Layout

```text
[OPEN] [GitHub]
Will issue #42 be fixed before Friday?

YES creator        NO open
Stake 0.01 ETH     Pot 0.02 ETH
Expires in 2d 04h

[Accept NO]
```

## Example Verdict Panel

```text
GenLayer Verdict

YES
Confidence: 86%

Evidence summary:
Official GitHub issue was closed by a merged PR before the expiry timestamp.

Sources checked:
- github.com/org/repo/issues/42
- github.com/org/repo/pull/99

Reasoning:
The claim required the issue to be fixed before Friday. The linked PR closed the issue and was merged before the expiry time.
```

## Frontend Copy Guidelines

Use:

- "Prediction duel"
- "Challenge"
- "Stake"
- "Pot"
- "Resolved by GenLayer"
- "Testnet only"
- "Experimental"

Avoid:

- "Gamble"
- "Casino"
- "Real-money"
- "Guaranteed"
- "Financial advice"

## Empty States

Explore:

- "No open duels yet. Create the first one."

My duels:

- "No duels for this wallet."

Expired:

- "This duel is ready for GenLayer resolution."

Invalid:

- "GenLayer could not resolve this claim from the provided evidence. Both sides can refund."

