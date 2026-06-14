# Wagr Base Contract Design

## Purpose

The Base contract is the escrow and settlement layer for Wagr duels. It should not adjudicate real-world claims. It should only enforce deposits, state transitions, resolver authorization, payout, and refunds.

## MVP Asset Choice

Use ETH deposits on Base Sepolia first.

Why:

- Simplest safe MVP path.
- No mock token deployment needed.
- Easy wallet UX.
- Fewer approval edge cases.

Add mock USDC later if needed:

- ERC20 `transferFrom` on create/accept.
- ERC20 `safeTransfer` on payout/refund.
- Token allowlist.

## Core Enums

```solidity
enum Side {
    None,
    Yes,
    No
}

enum DuelStatus {
    None,
    Open,
    Active,
    ResolutionRequested,
    Resolved,
    Invalid,
    Canceled,
    Paid
}

enum Verdict {
    None,
    Yes,
    No,
    Invalid
}
```

Use `Invalid` to cover invalid, unresolved, ambiguous, insufficient evidence, or source unavailable outcomes in the Base contract. Store full nuance in the GenLayer verdict JSON offchain.

## Duel Struct

```solidity
struct Duel {
    address creator;
    address counterparty;
    Side creatorSide;
    uint256 stakeAmount;
    uint256 expiry;
    bytes32 metadataHash;
    DuelStatus status;
    Verdict verdict;
    bool creatorClaimed;
    bool counterpartyClaimed;
    uint256 createdAt;
    uint256 acceptedAt;
    uint256 resolvedAt;
}
```

## Contract Roles

- `owner`: can update resolver address and emergency config.
- `resolver`: relayer address authorized to submit GenLayer verdicts during MVP.
- `creator`: creates a duel and deposits first stake.
- `counterparty`: accepts the opposite side and deposits second stake.
- `anyone`: can trigger frontend/relayer resolution flow, but not directly submit Base verdict unless authorized.

## Functions

### `createDuel`

Inputs:

- `Side creatorSide`
- `uint256 expiry`
- `bytes32 metadataHash`

Payable:

- `msg.value` is stake amount.

Rules:

- Creator side must be YES or NO.
- Expiry must be in the future.
- Stake must be greater than zero.
- Metadata hash must not be empty.
- Duel starts as `Open`.

### `acceptDuel`

Inputs:

- `uint256 duelId`

Payable:

- `msg.value` must equal `stakeAmount`.

Rules:

- Duel must be `Open`.
- Counterparty cannot be creator.
- Current time must be before expiry.
- Counterparty automatically takes opposite side.
- Duel becomes `Active`.

### `cancelOpenDuel`

Inputs:

- `uint256 duelId`

Rules:

- Only creator can cancel.
- Duel must be `Open`.
- Creator stake refunded.
- Duel becomes `Canceled`.

### `markResolutionRequested`

Optional for MVP.

Inputs:

- `uint256 duelId`

Rules:

- Duel must be `Active`.
- Current time must be after expiry.
- Can be called by anyone or only resolver.
- Emits `ResolutionRequested`.

This is useful for UI state but not strictly required.

### `submitVerdict`

Inputs:

- `uint256 duelId`
- `Verdict verdict`
- `uint16 confidenceBps`
- `bytes32 verdictHash`

Rules:

- Only resolver can call.
- Duel must be `Active` or `ResolutionRequested`.
- Current time must be after expiry.
- Verdict must be YES, NO, or INVALID.
- Confidence basis points must be 0 to 10000.
- Store verdict.
- Status becomes `Resolved` for YES/NO or `Invalid` for INVALID.
- Emit full event.

### `claimPayout`

Inputs:

- `uint256 duelId`

Rules:

- Duel must be resolved YES or NO.
- Caller must be winning side participant.
- Cannot claim twice.
- Pays full pot: `stakeAmount * 2`.
- Status can become `Paid` after payout.

### `claimRefund`

Inputs:

- `uint256 duelId`

Rules:

- Duel must be `Invalid`.
- Creator and counterparty can each withdraw their own stake.
- Cannot claim twice.
- Status becomes `Paid` after both refunded.

## Events

```solidity
event DuelCreated(
    uint256 indexed duelId,
    address indexed creator,
    Side creatorSide,
    uint256 stakeAmount,
    uint256 expiry,
    bytes32 metadataHash
);

event DuelAccepted(
    uint256 indexed duelId,
    address indexed counterparty
);

event DuelCanceled(
    uint256 indexed duelId
);

event ResolutionRequested(
    uint256 indexed duelId
);

event VerdictSubmitted(
    uint256 indexed duelId,
    Verdict verdict,
    uint16 confidenceBps,
    bytes32 verdictHash
);

event PayoutClaimed(
    uint256 indexed duelId,
    address indexed winner,
    uint256 amount
);

event RefundClaimed(
    uint256 indexed duelId,
    address indexed user,
    uint256 amount
);

event ResolverUpdated(
    address indexed oldResolver,
    address indexed newResolver
);
```

## Example Solidity Structure

This is a structure sketch, not production code.

```solidity
contract WagrDuelEscrow is Ownable, ReentrancyGuard {
    enum Side { None, Yes, No }
    enum DuelStatus { None, Open, Active, ResolutionRequested, Resolved, Invalid, Canceled, Paid }
    enum Verdict { None, Yes, No, Invalid }

    struct Duel {
        address creator;
        address counterparty;
        Side creatorSide;
        uint256 stakeAmount;
        uint256 expiry;
        bytes32 metadataHash;
        DuelStatus status;
        Verdict verdict;
        bool creatorClaimed;
        bool counterpartyClaimed;
        uint256 createdAt;
        uint256 acceptedAt;
        uint256 resolvedAt;
    }

    address public resolver;
    uint256 public nextDuelId;
    mapping(uint256 => Duel) public duels;

    function createDuel(Side creatorSide, uint256 expiry, bytes32 metadataHash)
        external
        payable
        returns (uint256 duelId);

    function acceptDuel(uint256 duelId) external payable;
    function cancelOpenDuel(uint256 duelId) external;
    function markResolutionRequested(uint256 duelId) external;
    function submitVerdict(uint256 duelId, Verdict verdict, uint16 confidenceBps, bytes32 verdictHash) external;
    function claimPayout(uint256 duelId) external;
    function claimRefund(uint256 duelId) external;
}
```

## Payout Logic

Winner:

- If creator side is YES and verdict is YES, creator wins.
- If creator side is NO and verdict is NO, creator wins.
- Otherwise counterparty wins.

Invalid:

- Creator gets `stakeAmount`.
- Counterparty gets `stakeAmount`.

## Security Considerations

- Use `nonReentrant` on payout/refund.
- Use checks-effects-interactions.
- Do not push payout automatically in `submitVerdict`; let users claim.
- Do not allow resolver to change stake or participants.
- Do not allow resolve before expiry.
- Do not allow accepting expired open duels.
- Do not allow creator to accept their own duel.
- Do not allow double payout or double refund.
- Store hashes for metadata/verdict traceability.

## MVP Centralization Point

The resolver address is trusted to submit the correct GenLayer result. This is acceptable for testnet MVP but should be explicit in UI and docs.

Later hardening:

- Multi-sig resolver.
- Multiple relayers.
- Threshold signatures.
- Optimistic challenge window.
- GenLayer proof verification if available.

