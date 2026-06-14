# Wagr First 20 Tasks

## First Implementation Tasks

1. Create the monorepo folder structure for `frontend`, `contracts/base`, `genlayer`, `relayer`, and `shared`.
2. Initialize the Vite + React + TypeScript frontend.
3. Add Tailwind CSS, React Router, wagmi, viem, TanStack Query, and lucide-react.
4. Configure Base Sepolia chain constants in `shared`.
5. Scaffold Foundry in `contracts/base`.
6. Write failing tests for Base escrow duel creation.
7. Implement the minimal `WagrDuelEscrow` ETH escrow create flow.
8. Add tests for accepting a duel with matching stake.
9. Implement accept flow and opposite-side enforcement.
10. Add tests for canceling open duels.
11. Add tests for resolver-only verdict submission.
12. Implement verdict submission and payout/refund state transitions.
13. Add tests for winner payout, invalid refunds, and double-claim prevention.
14. Build static frontend pages: landing, explore, create, detail, my duels, result.
15. Add wallet connect and Base Sepolia network guard.
16. Wire frontend reads to mocked duel data, then Base contract reads.
17. Wire create and accept wallet transactions.
18. Prototype the GenLayer resolver contract with controlled evidence fixtures.
19. Build minimal relayer that submits a mocked verdict to Base.
20. Replace mocked verdict with GenLayer resolver output and run one full testnet demo.

## Priority Rules

- Base escrow correctness comes first.
- Do not start complex frontend polish until create/accept works.
- Do not build generalized indexing until event reads are too slow.
- Do not add USDC until ETH flow is complete.
- Do not add multiple relayers until one relayer works.
- Do not build appeal UX in v1.

## First Demo Target

Use a controlled GitHub issue duel:

Claim:

> Will GitHub issue #X be closed before the expiry time?

Why:

- Public evidence.
- Stable source.
- Clear YES/NO criteria.
- Easy to demo GenLayer reasoning.
- Avoids price oracle territory.

## Suggested First Week Plan

Day 1:

- Scaffold repo.
- Build Base escrow tests.
- Implement create/accept/cancel.

Day 2:

- Implement verdict/payout/refund.
- Build static UI pages.

Day 3:

- Wallet connect.
- Base Sepolia reads/writes.
- Event display.

Day 4:

- GenLayer resolver prototype.
- Controlled evidence tests.

Day 5:

- Relayer prototype.
- End-to-end local/testnet demo.

Day 6:

- UI polish.
- Verdict panel.
- Demo script.

Day 7:

- Bug fixes.
- Final testnet walkthrough.
- Record demo.

