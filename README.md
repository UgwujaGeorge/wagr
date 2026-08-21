# Wagr

PvP prediction battles settled by GenLayer and built on Base.

Wagr is a one-on-one prediction duel app:

- Users create direct YES/NO duels.
- Base holds the stake, escrow, payout, and refund logic.
- GenLayer StudioNet resolves the public-evidence verdict.
- An attester quorum authorizes that verdict on Base. The relayer only pays gas.

Wagr is not an AMM or order book. Each duel is a matched 1v1 challenge.

## Supported Networks

| Network | Chain ID | RPC | Escrow contract |
| --- | ---: | --- | --- |
| Base Sepolia | `84532` | `https://sepolia.base.org` | `0xA93956bc90698b4Bf9080085c9047F55625381aE` |
| Base Mainnet | `8453` | `https://mainnet.base.org` | `0x13dF0E047a7D9db5fe4d7918D1663a04eD0bD09d` |

GenLayer remains on StudioNet:

- Network: `StudioNet`
- RPC: `https://studio.genlayer.com/api`
- Explorer: `https://explorer-studio.genlayer.com`
- Resolver: `0xfbCf2a7f6db786F03bc7391D6ea2ae05d7EF0340`

Base Sepolia is the default network. Base Mainnet is selectable and uses real
funds; the frontend shows a Mainnet badge and warnings.

## The Committed Wager

Every duel commits to its exact wager before anyone stakes. `metadataHash` on
Base is `sha256` over a canonical encoding of six fields:

| Field | Meaning |
| --- | --- |
| `claim` | The YES/NO proposition being judged |
| `resolutionRules` | The criteria for YES and NO |
| `evidenceUrls` | The exact evidence list, order significant |
| `allowedSourceTypes` | The human-readable source policy |
| `allowedDomains` | The machine-enforced host allowlist |
| `category` | The display category |

The canonical encoding lives in `shared/src/duelMetadata.ts` and is mirrored by
`_metadata_commitment` in `genlayer/contracts/wagr_resolver.py`. JSON is
deliberately avoided: `JSON.stringify` and Python's `json.dumps` disagree on
non-ASCII escaping and separator defaults, so the format is length-prefixed
instead. `npm run verify:encodings` proves the two implementations agree
byte-for-byte, including unicode, quotes, backslashes and newlines.

Enforcement happens at three independent layers:

1. **Relayer** rejects metadata that is not the preimage of its own hash,
   rejects a hash that is not the one Base holds, refuses to overwrite metadata
   once committed, and re-verifies the commitment again at resolution time.
2. **GenLayer resolver** recomputes the commitment from the arguments it was
   actually given and raises before fetching any evidence if it does not match.
   A tampered relayer cannot make GenLayer adjudicate a different claim.
3. **Base escrow** takes `metadataHash` in `submitVerdict` and reverts with
   `MetadataHashMismatch()`.

The source policy is enforced in deterministic code, not by prompting. Evidence
URLs must be `https`, must number between 1 and 5, and every host must appear in
the committed `allowedDomains`. Out-of-policy evidence resolves `INVALID`
without a single fetch, so it cannot be used as a prompt-injection vector.

## The Authenticated Duel Data

The wager is one half of what decides a duel. The other half is the duel state
Base holds, and the expiry is the sharpest edge of it: "was the issue closed
before expiry?" answers YES or NO depending entirely on that one number.

`authenticatedDuelDataHash` is `keccak256` over nine fields, and it is exactly
what `WagrDuelEscrow.duelStateHash(duelId)` computes from the escrow's own
storage:

| Field | Why it is in the hash |
| --- | --- |
| `chainId`, `escrowAddress` | An attestation for one deployment cannot replay on another |
| `duelId` | Ties the verdict to one duel |
| `creator`, `counterparty` | Neither participant can be swapped out |
| `creatorSide` | The counterparty's side is derived from it, never supplied |
| `stakeAmount` | The size of the wager is part of what was agreed |
| `expiry` | The deadline the claim is judged against |
| `metadataHash` | Pins the claim, rules, evidence and source policy |

The GenLayer resolver **recomputes this hash from the arguments it was actually
given** and refuses to go any further if the result differs from the hash it
was handed. So every Base-derived value the model ever sees — the expiry, both
sides, the participants, the stake, the escrow — is covered by a hash the
attesters independently compare against live Base storage. Alter the expiry to
steer the verdict and the hash changes; a hash `duelStateHash` does not produce
is not attestable by anyone, and the duel stays resolvable.

`resolve_duel` takes the expiry as a unix integer and renders the ISO string in
the prompt itself, so the human-readable expiry the model reads and the integer
inside the hash cannot disagree. That rendering is published on the verdict as
`expiry_time`, and each attester checks it against Base in the clear as well as
through the hash.

GenVM has no Ethereum-compatible Keccak-256 — `hashlib` offers SHA-256 and NIST
SHA-3, and SHA-3 differs from Keccak by a padding byte, which is enough to
produce a hash that never matches Base. The resolver therefore carries its own
Keccak-256, and `npm run verify:encodings` holds it against Solidity and viem
on every run.

### Resolution cannot start early

A duel is only adjudicable once the outcome it predicts is due. `resolve_duel`
reads the transaction's own pinned clock and rejects any call made before the
authenticated expiry, before fetching a single page. Base enforces the same
boundary independently: `markResolutionRequested` and `submitVerdict` both
require `block.timestamp >= duel.expiry`.

### Being first decides nothing

`resolve_duel` is permissionless so that settlement never depends on one party
staying online. That is only safe if being the caller confers nothing, so:

- **Verdicts are stored per Base state, not per duel.** The storage key is the
  duel ID *and* its authenticated duel data hash. A caller who invents duel
  state occupies only the slot for the state they invented. Attesters read the
  slot for the state Base actually holds, which stays resolvable.
- **A non-final result never occupies the duel.** `UNRESOLVED` means "not yet"
  — an unreachable evidence host, an unparseable model response — and can be
  superseded by a later resolution. Only `YES`, `NO` and `INVALID` are frozen.
  The alternative would let anyone who can make one evidence fetch fail force
  both participants into a permanent refund.
- **`resolved_at` comes from the transaction, not the model**, so the timestamp
  on a verdict is not something the model can dictate.

## Verdict Authorization

Base does not trust the relayer key. A verdict is only accepted when it carries
an EIP-712 attestation quorum.

```text
GenLayer verdict (FINALIZED)
        │
        ├── attester 1 verifies independently ──┐
        ├── attester 2 verifies independently ──┤  M-of-N signatures
        └── attester 3 (break-glass, offline) ──┘
                                                │
                    relayer pays gas ───────────┴──► WagrDuelEscrow
```

Each attester re-derives everything itself: it recomputes the metadata
commitment, reads `duels(duelId)` live from Base, reads the finalized GenLayer
verdict, and checks every binding field before signing. Nothing is taken on the
caller's word.

The digest each attester signs binds the duel to a single escrow on a single
chain:

```text
EIP712Domain(name: "Wagr", version: "1", chainId, verifyingContract)
Verdict(duelId, verdict, confidenceBps, metadataHash,
        authenticatedDuelDataHash, verdictHash, genlayerTxHash)
```

`authenticatedDuelDataHash` is not supplied by the attester. The escrow
recomputes it from its own storage in `duelStateHash(duelId)`, so an attestation
can never describe duel state that Base does not actually hold. The escrow also
requires signatures in ascending signer order, which makes duplicate signers
unrepresentable, and rejects malleable high-`s` signatures.

`genlayerTxHash` is recorded in the `VerdictSubmitted` event so anyone can audit
a Base payout against the GenLayer transaction that produced it.

### Finality

Attesters wait for GenLayer `FINALIZED`, not `ACCEPTED`. An accepted verdict is
still inside its appeal window and can be overturned; paying out on one would
let an appeal invalidate a settled duel.

### Challenge window

A quorum verdict does not pay out immediately. It enters `VerdictProposed` for
`challengeWindow` seconds (currently 30 minutes).

- Nobody challenges → anyone calls `finalizeVerdict` and the duel settles.
- Either participant calls `challengeVerdict` → the duel enters `Challenged`,
  and settling now requires a signature from **every** attester.
- The attesters do not answer unanimously → `finalizeChallenge` settles the duel
  as `INVALID` and both participants refund.

Challenging cannot overturn a correct verdict; it only raises the bar. So the
losing side gains no advantage by challenging reflexively, while a genuinely
split attester set always ends in a refund rather than a wrong payout.

### Timeout refund

If no verdict ever arrives, `markResolutionTimedOut` becomes callable
`resolutionGracePeriod` after expiry (currently 7 days) and both sides refund.
Without this, an offline relayer or attester set would strand both stakes
permanently — which is exactly what happened to a duel on the previous mainnet
escrow.

## Tests

```bash
npm test
```

That runs all four checks:

```bash
npm run relayer:test      # 34 — commitment enforcement, quorum, attester behaviour
npm run contracts:test    # 43 — escrow lifecycle, quorum authorization, challenge, timeout
npm run genlayer:test     # 91 — resolver binding, metadata mutation, source policy
npm run verify:encodings  # 23 — TypeScript vs Python vs Solidity encodings agree
```

The GenLayer suite runs the resolver offline against a stub of the GenVM runtime
in `genlayer/tests/genlayer_stub.py`, so it needs no GenLayer credentials and no
network access.

Adversarial coverage includes: metadata mutated in every committed field
(claim, rules, added/removed/substituted/reordered evidence URLs, source types,
widened domains, category, trailing whitespace); tampered storage discovered at
resolution time; verdicts submitted with zero, insufficient, duplicated and
non-attester signatures; the old relayer key acting alone; attestations replayed
from another duel, another verdict, another metadata hash and another escrow
deployment; unordered signatures; removed attesters; a non-finalized GenLayer
transaction; disagreeing attesters; and challenge, escalation and timeout paths.

On the two paths the steward asked about specifically:

**Altered expiry.** The expiry pushed later, pulled earlier and moved by a
single second; each rejected by the resolver before any fetch or prompt, and
each leaving the duel resolvable afterwards. The same alterations to the stake,
the creator side, either participant, the escrow address and the metadata hash.
An expiry supplied as an ISO string instead of an integer. Attesters refusing a
verdict whose duel data hash reflects an altered expiry, and refusing one whose
`expiry_time` alone disagrees with Base. On Base: the duel state hash proven to
commit to the expiry, an attestation over the real duel state accepted, the same
attestation over an altered expiry rejected, and the duel still settling
normally afterwards.

**First-caller poisoning.** Resolution attempted before expiry — rejected,
storing nothing, fetching nothing, and leaving the duel resolvable once expiry
passes. A first caller resolving against invented Base state — their verdict is
not returned for the real duel, and the real duel resolves on its own merits. A
transient fetch failure and an unparseable model response — both superseded by a
later resolution rather than freezing a refund. A final verdict — not
overwritable. On Base: resolution requested before expiry rejected, a stranger
requesting resolution after expiry changing nothing about how the duel settles,
and the timeout refund still reachable afterwards.

## Local Setup

```bash
npm install
npm run build
npm test
```

Run the relayer and frontend in separate terminals:

```bash
npm run dev:relayer
npm run dev:frontend
```

The frontend runs at `http://localhost:5173`, the relayer at
`http://localhost:8787`.

```bash
curl http://localhost:8787/health
```

## Environment

Copy `.env.example` to `.env` and fill local values. Never commit `.env`.

Attestation variables deserve particular care:

```bash
# This process's attester identity. Must be registered on the escrow.
WAGR_ATTESTER_PRIVATE_KEY=
# Independent attester services asked to co-sign. Comma separated.
WAGR_ATTESTER_ENDPOINTS=
# Shared secret guarding /attest.
WAGR_ATTESTER_AUTH_TOKEN=
# Never false outside local development.
WAGR_REQUIRE_GENLAYER_FINALITY=true
```

`RELAYER_PRIVATE_KEY` now pays gas and nothing else. Compromising it cannot
change a verdict.

## Deployment Registry

`deployments/base.json` records both escrows, the resolver, the attester set,
the threshold, the challenge window, the grace period, and the addresses each
deployment superseded.

## Deploying

Deployment bakes the attester set into the escrow:

```bash
WAGR_ATTESTERS=0xattester1,0xattester2,0xattester3
WAGR_ATTESTER_THRESHOLD=2
WAGR_CHALLENGE_WINDOW_SECONDS=1800
WAGR_RESOLUTION_GRACE_SECONDS=604800
```

```bash
npm run deploy:base-sepolia
npm run contracts:dry-run:base-mainnet   # no broadcast
npm run deploy:base-mainnet              # prompts for confirmation
```

After deployment, update `deployments/base.json`, both escrow addresses in
`.env`, the Render service variables, and the Vercel project variables, then
re-run `npm run build`.

Regenerate the shared ABI whenever the contract changes:

```bash
npm run contracts:abi
```

## GenLayer StudioNet

The frontend sends `resolve_duel(...)` to GenLayer StudioNet for the user to
sign. Attesters then read `get_resolution_json(...)` and sign the Base verdict.

`UNRESOLVED` results are submitted to Base as `INVALID` so both participants can
refund; the original reason is preserved in the relayer record and shown in the
app. The `No resolution stored for duel` sentinel is the exception — it means
not-yet-resolved and is never submitted, so the duel can be retried. Because the
resolver treats `UNRESOLVED` as replaceable, resolving again is worth trying
before accepting the refund.

```bash
npm run genlayer:schema   # inspect the deployed resolver
npm run genlayer:deploy   # only when the resolver changes
```

`resolve_duel` and `get_resolution_json` both changed shape when the
authenticated duel data binding went in, so the resolver has to be redeployed
and `GENLAYER_RESOLVER_ADDRESS` updated on Render and Vercel before the new
frontend and relayer will work. The escrows are unchanged and do not need
redeploying. `WAGR_RESOLUTION_SCOPE` moved to `wagr.base.genlayer.v2` at the
same time, so a verdict from the old resolver — adjudicated with an expiry
nothing checked — can never satisfy a current attester.

## Known Trust Boundaries

Stated plainly, because a quorum is only as independent as its keys:

- Two of the three attester keys currently run as separate Render services under
  one account. That defeats a single compromised process, not a compromised
  Render account. The third key is held offline by the project owner and is not
  deployed anywhere.
- Raising real independence means running an attester somewhere else entirely.
  The escrow supports it already: `addAttester` and `setThreshold` need no
  redeploy.
- There is no trustless GenLayer→Base proof. GenLayer external messages reach
  only GenLayer Chain's own EVM layer through ghost contracts, and those are not
  implemented on StudioNet. The quorum plus challenge window is the strongest
  available construction, not a light client.
