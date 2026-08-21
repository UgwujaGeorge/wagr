"""Adversarial tests for the Wagr GenLayer resolver's Base duel binding.

Every resolver invocation must be bound to one specific Base duel: its chain,
its duel ID, its metadata hash, and the authenticated duel data the Base escrow
actually holds -- creator, counterparty, sides, stake and expiry. These tests
drive the paths a malicious or careless caller would take, including the two the
steward called out: steering the verdict by altering the expiry, and occupying a
duel by being the first caller.
"""

import hashlib
import importlib.util
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS_DIR))

import genlayer_stub  # noqa: E402

# `wagr_resolver.py` does `from genlayer import *`, so the stub has to be in
# place before the module is loaded.
sys.modules["genlayer"] = genlayer_stub

_RESOLVER_PATH = TESTS_DIR.parent / "contracts" / "wagr_resolver.py"
_spec = importlib.util.spec_from_file_location("wagr_resolver", _RESOLVER_PATH)
wagr_resolver = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(wagr_resolver)

WagrResolver = wagr_resolver.WagrResolver
UserError = genlayer_stub.gl.vm.UserError

CHAIN_ID = 84532
BASE_DUEL_ID = "7"
DUEL_ID = f"{CHAIN_ID}:{BASE_DUEL_ID}"

ESCROW = "0xA93956bc90698b4Bf9080085c9047F55625381aE"
CREATOR = "0x844d39D406D5dCC22291C4e2D8CE1541d39d0039"
COUNTERPARTY = "0xBa250C8ddb4bcB0E5C386e7Efe1A5B686053b207"
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
STAKE = "1000000000000000"

# The resolver reads the transaction's own pinned clock, so expiries are
# expressed relative to it rather than pinned to a calendar date that would
# quietly flip these tests from "expired" to "not yet" as time passes.
NOW = int(datetime.now(timezone.utc).timestamp())
EXPIRY = NOW - 3600
FUTURE_EXPIRY = NOW + 3600

CLAIM = "Team A wins the match before the expiry time."
RULES = "Resolve YES only if an official result page reports a Team A win."
EVIDENCE_URLS = ["https://example.com/results"]
ALLOWED_SOURCE_TYPES = ["official"]
ALLOWED_DOMAINS = ["example.com"]
CATEGORY = "Sport"


def expected_metadata_hash(
    claim=CLAIM,
    resolution_rules=RULES,
    evidence_urls=EVIDENCE_URLS,
    allowed_source_types=ALLOWED_SOURCE_TYPES,
    allowed_domains=ALLOWED_DOMAINS,
    category=CATEGORY,
):
    """Independent reimplementation of the canonical metadata commitment.

    Deliberately not the resolver's own helper: if the encoder drifts, this
    reimplementation and the cross-language fixtures both have to be wrong in
    the same way for the tests to keep passing.
    """

    def field(value):
        text = str(value)
        return f"{len(text.encode('utf-8'))}:{text}\n"

    def lst(values):
        return f"{len(values)}\n" + "".join(field(value) for value in values)

    canonical = (
        "wagr.metadata.v1\n"
        + field(claim)
        + field(resolution_rules)
        + lst(evidence_urls)
        + lst(allowed_source_types)
        + lst(allowed_domains)
        + field(category)
    )
    return "0x" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


METADATA_HASH = expected_metadata_hash()


def expected_duel_data_hash(
    base_chain_id=CHAIN_ID,
    base_escrow_address=ESCROW,
    base_duel_id=BASE_DUEL_ID,
    creator=CREATOR,
    counterparty=COUNTERPARTY,
    creator_side="YES",
    stake_amount_wei=STAKE,
    expiry_timestamp=EXPIRY,
    metadata_hash=METADATA_HASH,
):
    """Independent ABI encoding of `WagrDuelEscrow.duelStateHash`.

    All nine fields are static ABI types, so the encoding is simply their nine
    32-byte words back to back -- written out here rather than borrowed from
    the resolver. Keccak-256 itself is the resolver's, because Python ships no
    Ethereum-compatible one; `npm run verify:encodings` holds that
    implementation against Solidity and viem on every run.
    """

    def word(value):
        return int(value).to_bytes(32, "big")

    encoded = (
        word(base_chain_id)
        + word(int(base_escrow_address, 16))
        + word(int(base_duel_id))
        + word(int(creator, 16))
        + word(int(counterparty, 16))
        + word(1 if creator_side == "YES" else 2)
        + word(int(stake_amount_wei))
        + word(int(expiry_timestamp))
        + bytes.fromhex(str(metadata_hash)[2:])
    )
    return "0x" + wagr_resolver.keccak256(encoded).hex()


DUEL_DATA_HASH = expected_duel_data_hash()

VALID_ARGS = {
    "duel_id": DUEL_ID,
    "base_chain_id": CHAIN_ID,
    "base_duel_id": BASE_DUEL_ID,
    "base_escrow_address": ESCROW,
    "creator": CREATOR,
    "counterparty": COUNTERPARTY,
    "creator_side": "YES",
    "stake_amount_wei": STAKE,
    "expiry_timestamp": str(EXPIRY),
    "metadata_hash": METADATA_HASH,
    "authenticated_duel_data_hash": DUEL_DATA_HASH,
    "claim": CLAIM,
    "resolution_rules": RULES,
    "evidence_urls": EVIDENCE_URLS,
    "allowed_source_types": ALLOWED_SOURCE_TYPES,
    "allowed_domains": ALLOWED_DOMAINS,
    "category": CATEGORY,
}

LEADER_VERDICT = {
    "verdict": "YES",
    "confidence": 90,
    "evidence_summary": "The official results page reports a Team A win.",
    "sources_checked": [
        {
            "url": "https://example.com/results",
            "status": "checked",
            "relevance": "Official result listing.",
            "supports": "YES",
        }
    ],
    "reasoning": "The official source states Team A won before expiry.",
    "invalid_reason": "",
}


def call_args(**overrides):
    """Arguments carrying the duel's real committed hash, whatever else changes.

    This is the tampering shape: the attacker keeps the hash Base holds and
    varies the content underneath it.
    """
    args = dict(VALID_ARGS)
    args.update(overrides)
    return args


def bound_args(**overrides):
    """Arguments for a duel whose Base state genuinely is the overridden one."""
    args = call_args(**overrides)
    args["authenticated_duel_data_hash"] = expected_duel_data_hash(
        base_chain_id=args["base_chain_id"],
        base_escrow_address=args["base_escrow_address"],
        base_duel_id=args["base_duel_id"],
        creator=args["creator"],
        counterparty=args["counterparty"],
        creator_side=args["creator_side"],
        stake_amount_wei=args["stake_amount_wei"],
        expiry_timestamp=args["expiry_timestamp"],
        metadata_hash=args["metadata_hash"],
    )
    return args


class ResolverBindingTestCase(unittest.TestCase):
    def setUp(self):
        self.resolver = WagrResolver()
        genlayer_stub.gl.nondet.web.render = staticmethod(
            lambda url, mode="text": "Official results: Team A won."
        )
        genlayer_stub.gl.nondet.exec_prompt = staticmethod(
            lambda prompt, response_format=None: json.dumps(LEADER_VERDICT)
        )

    def resolve(self, **overrides):
        return self.resolver.resolve_duel(**call_args(**overrides))

    def resolve_bound(self, **overrides):
        return self.resolver.resolve_duel(**bound_args(**overrides))

    def stored(self, duel_id=DUEL_ID, duel_data_hash=DUEL_DATA_HASH):
        return json.loads(self.resolver.get_resolution_json(duel_id, duel_data_hash))

    def capture_prompt(self):
        captured = {}

        def capture(prompt, response_format=None):
            captured["prompt"] = prompt
            return json.dumps(LEADER_VERDICT)

        genlayer_stub.gl.nondet.exec_prompt = staticmethod(capture)
        return captured

    def never_fetches(self):
        def explode(url, mode="text"):
            raise AssertionError("evidence must never be fetched on this path")

        def explode_prompt(prompt, response_format=None):
            raise AssertionError("the model must never be prompted on this path")

        genlayer_stub.gl.nondet.web.render = staticmethod(explode)
        genlayer_stub.gl.nondet.exec_prompt = staticmethod(explode_prompt)


class KeccakTests(unittest.TestCase):
    """The resolver carries its own Keccak-256 because GenVM has none.

    SHA-3 and Keccak differ only in a padding byte, so a wrong implementation
    would still hash, still be deterministic, and still produce a duel data
    hash that never matches Base. These are the published vectors.
    """

    def test_empty_input(self):
        self.assertEqual(
            "0x" + wagr_resolver.keccak256(b"").hex(),
            "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        )

    def test_short_input(self):
        self.assertEqual(
            "0x" + wagr_resolver.keccak256(b"abc").hex(),
            "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
        )

    def test_input_spanning_multiple_blocks(self):
        # 200 bytes is two absorb blocks at the 136-byte rate, so this covers
        # the padding path a single-block test would miss.
        self.assertEqual(
            "0x" + wagr_resolver.keccak256(bytes(range(200))).hex(),
            "0xbfb0aa97863e797943cf7c33bb7e880bb4543f3d2703c0923c6901c2af57b890",
        )

    def test_input_one_byte_short_of_the_rate(self):
        # 135 bytes is where the 0x01 and 0x80 padding bytes have to share a
        # single byte. Pinned against what `cast keccak` returns.
        self.assertEqual(
            "0x" + wagr_resolver.keccak256(bytes(135)).hex(),
            "0x29e3704feeca7fb9ba229f0fa04d9b36449cf3ad6e1d85d9cfff3a10df9abc3e",
        )

    def test_is_not_sha3(self):
        self.assertNotEqual(wagr_resolver.keccak256(b""), hashlib.sha3_256(b"").digest())


class AuthenticatedDuelDataBindingTests(ResolverBindingTestCase):
    """Every Base-derived prompt input is covered by the authenticated hash.

    The resolver recomputes `authenticated_duel_data_hash` from the arguments
    it was actually handed. Changing any of them to steer the model changes the
    hash, and a hash the escrow's own `duelStateHash` does not produce is not
    attestable by anyone.
    """

    def test_matching_authenticated_duel_data_resolves(self):
        self.assertEqual(json.loads(self.resolve())["verdict"], "YES")

    def assertRejectsAlteration(self, **overrides):
        with self.assertRaises(UserError) as caught:
            self.resolve(**overrides)
        self.assertIn("authenticated duel data hash", str(caught.exception))
        self.assertEqual(len(self.resolver.resolutions), 0)

    # ------------------------------------------------------- altered expiry

    def test_expiry_pushed_later_is_rejected(self):
        # "Was it closed before expiry?" answers YES or NO depending entirely
        # on this number, which is exactly why it cannot be a free parameter.
        self.assertRejectsAlteration(expiry_timestamp=str(EXPIRY + 30 * 86400))

    def test_expiry_pulled_earlier_is_rejected(self):
        self.assertRejectsAlteration(expiry_timestamp=str(EXPIRY - 30 * 86400))

    def test_expiry_altered_by_one_second_is_rejected(self):
        self.assertRejectsAlteration(expiry_timestamp=str(EXPIRY + 1))

    def test_altered_expiry_never_reaches_the_model(self):
        self.never_fetches()
        self.assertRejectsAlteration(expiry_timestamp=str(EXPIRY + 30 * 86400))

    def test_altered_expiry_leaves_the_duel_resolvable(self):
        with self.assertRaises(UserError):
            self.resolve(expiry_timestamp=str(EXPIRY + 30 * 86400))
        self.assertEqual(json.loads(self.resolve())["verdict"], "YES")

    def test_prompt_carries_the_authenticated_expiry(self):
        captured = self.capture_prompt()
        self.resolve()
        context = json.loads(captured["prompt"].split("Context JSON: ", 1)[1])
        self.assertEqual(context["expiry_timestamp"], EXPIRY)
        self.assertEqual(
            context["expiry_time"],
            datetime.fromtimestamp(EXPIRY, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )

    def test_stored_verdict_reports_the_authenticated_expiry(self):
        verdict = json.loads(self.resolve())
        self.assertEqual(
            verdict["expiry_time"],
            datetime.fromtimestamp(EXPIRY, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )

    def test_a_genuinely_different_expiry_needs_a_different_hash(self):
        # The honest path: a duel whose Base expiry really is this one.
        verdict = json.loads(self.resolve_bound(expiry_timestamp=str(NOW - 7200)))
        self.assertEqual(verdict["verdict"], "YES")
        self.assertEqual(
            verdict["authenticated_duel_data_hash"],
            expected_duel_data_hash(expiry_timestamp=NOW - 7200),
        )
        self.assertNotEqual(verdict["authenticated_duel_data_hash"], DUEL_DATA_HASH)

    def test_non_numeric_expiry_is_rejected(self):
        with self.assertRaises(UserError) as caught:
            self.resolve(expiry_timestamp="2026-01-01T00:00:00Z")
        self.assertIn("Expiry timestamp must be an unsigned integer", str(caught.exception))

    # ------------------------------------------- other Base-derived inputs

    def test_altered_creator_side_is_rejected(self):
        self.assertRejectsAlteration(creator_side="NO")

    def test_altered_stake_is_rejected(self):
        self.assertRejectsAlteration(stake_amount_wei="2000000000000000")

    def test_altered_creator_is_rejected(self):
        self.assertRejectsAlteration(creator="0x000000000000000000000000000000000000dEaD")

    def test_altered_counterparty_is_rejected(self):
        self.assertRejectsAlteration(counterparty="0x000000000000000000000000000000000000dEaD")

    def test_altered_escrow_address_is_rejected(self):
        # An attestation for one escrow must not be reachable from another.
        self.assertRejectsAlteration(base_escrow_address="0x1854520Dbc6BE60e5298c4e5d13a8DdC08f91656")

    def test_altered_metadata_hash_is_rejected(self):
        self.assertRejectsAlteration(metadata_hash=expected_metadata_hash(claim="Something else entirely."))

    def test_counterparty_side_is_derived_from_the_authenticated_creator_side(self):
        captured = self.capture_prompt()
        self.resolve_bound(creator_side="NO")
        context = json.loads(captured["prompt"].split("Context JSON: ", 1)[1])
        self.assertEqual(context["creator_side"], "NO")
        self.assertEqual(context["counterparty_side"], "YES")

    def test_unaccepted_duel_cannot_be_resolved(self):
        # No counterparty means nothing was ever matched or staked.
        with self.assertRaises(UserError) as caught:
            self.resolve_bound(counterparty=ZERO_ADDRESS)
        self.assertIn("Counterparty must be a non-zero address", str(caught.exception))

    def test_zero_creator_is_rejected(self):
        with self.assertRaises(UserError) as caught:
            self.resolve_bound(creator=ZERO_ADDRESS)
        self.assertIn("Creator must be a non-zero address", str(caught.exception))

    def test_zero_escrow_address_is_rejected(self):
        with self.assertRaises(UserError) as caught:
            self.resolve_bound(base_escrow_address=ZERO_ADDRESS)
        self.assertIn("Base escrow address must be a non-zero address", str(caught.exception))

    def test_malformed_escrow_address_is_rejected(self):
        with self.assertRaises(UserError):
            self.resolve(base_escrow_address="0x1234")

    def test_zero_stake_is_rejected(self):
        with self.assertRaises(UserError) as caught:
            self.resolve_bound(stake_amount_wei="0")
        self.assertIn("Stake amount must be greater than zero", str(caught.exception))

    def test_invalid_creator_side_is_rejected(self):
        with self.assertRaises(UserError) as caught:
            self.resolve(creator_side="MAYBE")
        self.assertIn("Creator side must be YES or NO", str(caught.exception))


class PreExpiryResolutionTests(ResolverBindingTestCase):
    """A duel cannot be adjudicated before the outcome it predicts is due.

    Without this gate, anyone could resolve the instant a duel was accepted,
    against evidence describing a future that had not happened, and freeze that
    answer as the verdict.
    """

    def test_resolution_before_expiry_is_rejected(self):
        with self.assertRaises(UserError) as caught:
            self.resolve_bound(expiry_timestamp=str(FUTURE_EXPIRY))
        self.assertIn("before its Base expiry", str(caught.exception))

    def test_pre_expiry_call_stores_nothing(self):
        with self.assertRaises(UserError):
            self.resolve_bound(expiry_timestamp=str(FUTURE_EXPIRY))
        self.assertEqual(len(self.resolver.resolutions), 0)

    def test_pre_expiry_call_never_fetches_evidence_or_prompts(self):
        self.never_fetches()
        with self.assertRaises(UserError):
            self.resolve_bound(expiry_timestamp=str(FUTURE_EXPIRY))

    def test_pre_expiry_call_leaves_the_duel_resolvable_after_expiry(self):
        future = bound_args(expiry_timestamp=str(FUTURE_EXPIRY))
        with self.assertRaises(UserError):
            self.resolver.resolve_duel(**future)

        # Same duel, same everything, once its expiry has passed.
        verdict = json.loads(self.resolve())
        self.assertEqual(verdict["verdict"], "YES")

    def test_resolution_exactly_at_expiry_is_allowed(self):
        verdict = json.loads(self.resolve_bound(expiry_timestamp=str(NOW)))
        self.assertEqual(verdict["verdict"], "YES")


class FirstCallerPoisoningTests(ResolverBindingTestCase):
    """Being first must not be enough to decide, or to block, a duel.

    `resolve_duel` is permissionless by design, so liveness never depends on
    one party staying online. That only holds if a hostile or unlucky first
    caller cannot take the duel's one resolution slot away from it.
    """

    def poisoned_args(self):
        """A self-consistent binding for Base state the escrow does not hold."""
        return bound_args(stake_amount_wei="999999999999999999")

    def test_invented_base_state_does_not_block_the_real_duel(self):
        poisoned = self.poisoned_args()
        genlayer_stub.gl.nondet.exec_prompt = staticmethod(
            lambda prompt, response_format=None: json.dumps({**LEADER_VERDICT, "verdict": "NO", "sources_checked": [
                {**LEADER_VERDICT["sources_checked"][0], "supports": "NO"}
            ]})
        )
        self.assertEqual(json.loads(self.resolver.resolve_duel(**poisoned))["verdict"], "NO")

        # The duel Base actually holds still resolves, on its own merits.
        genlayer_stub.gl.nondet.exec_prompt = staticmethod(
            lambda prompt, response_format=None: json.dumps(LEADER_VERDICT)
        )
        honest = json.loads(self.resolve())
        self.assertEqual(honest["verdict"], "YES")
        self.assertEqual(honest["authenticated_duel_data_hash"], DUEL_DATA_HASH)

    def test_invented_base_state_is_not_returned_for_the_real_duel(self):
        self.resolver.resolve_duel(**self.poisoned_args())

        # An attester asks for the verdict against the state Base holds, and
        # gets the not-yet-resolved default rather than the attacker's answer.
        self.assertEqual(self.stored()["invalid_reason"], "No resolution stored for duel")
        self.assertEqual(self.stored()["authenticated_duel_data_hash"], "")

    def test_each_binding_keeps_its_own_verdict(self):
        self.resolver.resolve_duel(**self.poisoned_args())
        self.resolve()

        poisoned_hash = self.poisoned_args()["authenticated_duel_data_hash"]
        self.assertEqual(self.stored()["authenticated_duel_data_hash"], DUEL_DATA_HASH)
        self.assertEqual(
            self.stored(duel_data_hash=poisoned_hash)["authenticated_duel_data_hash"],
            poisoned_hash,
        )

    def test_unreachable_evidence_does_not_occupy_the_duel(self):
        def failing_render(url, mode="text"):
            raise RuntimeError("network unreachable")

        genlayer_stub.gl.nondet.web.render = staticmethod(failing_render)
        first = json.loads(self.resolve())
        self.assertEqual(first["verdict"], "UNRESOLVED")

        # UNRESOLVED means "not yet", not "both sides refund forever".
        genlayer_stub.gl.nondet.web.render = staticmethod(
            lambda url, mode="text": "Official results: Team A won."
        )
        second = json.loads(self.resolve())
        self.assertEqual(second["verdict"], "YES")
        self.assertEqual(self.stored()["verdict"], "YES")

    def test_malformed_model_response_does_not_occupy_the_duel(self):
        genlayer_stub.gl.nondet.exec_prompt = staticmethod(
            lambda prompt, response_format=None: "not json at all"
        )
        self.assertEqual(json.loads(self.resolve())["verdict"], "UNRESOLVED")

        genlayer_stub.gl.nondet.exec_prompt = staticmethod(
            lambda prompt, response_format=None: json.dumps(LEADER_VERDICT)
        )
        self.assertEqual(json.loads(self.resolve())["verdict"], "YES")

    def test_a_final_verdict_cannot_be_overwritten(self):
        self.assertEqual(json.loads(self.resolve())["verdict"], "YES")

        genlayer_stub.gl.nondet.exec_prompt = staticmethod(
            lambda prompt, response_format=None: json.dumps({**LEADER_VERDICT, "verdict": "NO"})
        )
        with self.assertRaises(UserError) as caught:
            self.resolve()
        self.assertIn("already resolved", str(caught.exception))
        self.assertEqual(self.stored()["verdict"], "YES")

    def test_an_invalid_verdict_is_final(self):
        # INVALID pays nobody and refunds both, so re-rolling it must not be a
        # way to keep asking until the answer changes.
        off_policy = ["https://attacker.example/results"]
        args = bound_args(
            evidence_urls=off_policy,
            metadata_hash=expected_metadata_hash(evidence_urls=off_policy),
        )
        self.assertEqual(json.loads(self.resolver.resolve_duel(**args))["verdict"], "INVALID")
        with self.assertRaises(UserError):
            self.resolver.resolve_duel(**args)

    def test_poisoning_one_duel_does_not_touch_another(self):
        self.resolve()
        other = json.loads(self.resolve_bound(duel_id=f"{CHAIN_ID}:8", base_duel_id="8"))
        self.assertEqual(other["base_duel_id"], "8")
        self.assertEqual(other["verdict"], "YES")


class MismatchedDuelIdTests(ResolverBindingTestCase):
    def test_duel_id_not_matching_base_duel_id_is_rejected(self):
        with self.assertRaises(UserError) as caught:
            self.resolve(duel_id=f"{CHAIN_ID}:8")
        self.assertIn("chain-bound", str(caught.exception))

    def test_legacy_unprefixed_duel_id_is_rejected(self):
        with self.assertRaises(UserError) as caught:
            self.resolve(duel_id=BASE_DUEL_ID)
        self.assertIn("chain-bound", str(caught.exception))

    def test_duel_id_bound_to_another_chain_is_rejected(self):
        with self.assertRaises(UserError) as caught:
            self.resolve(duel_id=f"8453:{BASE_DUEL_ID}")
        self.assertIn("chain-bound", str(caught.exception))

    def test_unsupported_base_chain_id_is_rejected(self):
        with self.assertRaises(UserError) as caught:
            self.resolve(base_chain_id=1, duel_id=f"1:{BASE_DUEL_ID}")
        self.assertIn("Unsupported Base chain ID", str(caught.exception))

    def test_non_numeric_base_duel_id_is_rejected(self):
        with self.assertRaises(UserError) as caught:
            self.resolve(base_duel_id="7a", duel_id=f"{CHAIN_ID}:7a")
        self.assertIn("numeric", str(caught.exception))

    def test_the_same_duel_number_on_the_other_chain_is_a_different_duel(self):
        with self.assertRaises(UserError):
            self.resolve(base_chain_id=8453, duel_id=f"8453:{BASE_DUEL_ID}")

    def test_rejected_invocation_stores_nothing(self):
        with self.assertRaises(UserError):
            self.resolve(duel_id=BASE_DUEL_ID)
        self.assertEqual(len(self.resolver.resolutions), 0)


class BindingHashTests(ResolverBindingTestCase):
    def test_non_bytes32_metadata_hash_is_rejected(self):
        with self.assertRaises(UserError) as caught:
            self.resolve(metadata_hash="0xdeadbeef")
        self.assertIn("Metadata hash must be bytes32", str(caught.exception))

    def test_empty_metadata_hash_is_rejected(self):
        with self.assertRaises(UserError):
            self.resolve(metadata_hash="")

    def test_non_hex_metadata_hash_is_rejected(self):
        with self.assertRaises(UserError):
            self.resolve(metadata_hash="0x" + "zz" * 32)

    def test_non_bytes32_authenticated_duel_data_hash_is_rejected(self):
        with self.assertRaises(UserError) as caught:
            self.resolve(authenticated_duel_data_hash="0x1234")
        self.assertIn("Authenticated duel data hash must be bytes32", str(caught.exception))

    def test_binding_hashes_are_stored_lowercased(self):
        verdict = json.loads(
            self.resolve(
                metadata_hash=METADATA_HASH.upper().replace("0X", "0x"),
                authenticated_duel_data_hash=DUEL_DATA_HASH.upper().replace("0X", "0x"),
            )
        )
        self.assertEqual(verdict["metadata_hash"], METADATA_HASH)
        self.assertEqual(verdict["authenticated_duel_data_hash"], DUEL_DATA_HASH)

    def test_a_verdict_is_readable_under_either_hash_casing(self):
        self.resolve()
        upper = DUEL_DATA_HASH.upper().replace("0X", "0x")
        self.assertEqual(self.stored(duel_data_hash=upper)["verdict"], "YES")


class StoredVerdictBindingTests(ResolverBindingTestCase):
    def test_stored_verdict_carries_every_binding_field(self):
        verdict = json.loads(self.resolve())
        self.assertEqual(verdict["resolution_scope"], wagr_resolver.WAGR_RESOLUTION_SCOPE)
        self.assertEqual(verdict["duel_id"], DUEL_ID)
        self.assertEqual(verdict["base_chain_id"], CHAIN_ID)
        self.assertEqual(verdict["base_duel_id"], BASE_DUEL_ID)
        self.assertEqual(verdict["metadata_hash"], METADATA_HASH)
        self.assertEqual(verdict["authenticated_duel_data_hash"], DUEL_DATA_HASH)

    def test_stored_verdict_is_readable_under_the_bound_duel_id(self):
        returned = json.loads(self.resolve())
        self.assertEqual(returned, self.stored())

    def test_resolved_at_comes_from_the_transaction_not_the_model(self):
        genlayer_stub.gl.nondet.exec_prompt = staticmethod(
            lambda prompt, response_format=None: json.dumps(
                {**LEADER_VERDICT, "resolved_at": "1999-01-01T00:00:00Z"}
            )
        )
        verdict = json.loads(self.resolve())
        self.assertNotEqual(verdict["resolved_at"], "1999-01-01T00:00:00Z")
        self.assertTrue(verdict["resolved_at"].endswith("Z"))

    def test_unreachable_evidence_stays_bound_to_the_base_duel(self):
        def failing_render(url, mode="text"):
            raise RuntimeError("network unreachable")

        genlayer_stub.gl.nondet.web.render = staticmethod(failing_render)

        verdict = json.loads(self.resolve())
        self.assertEqual(verdict["verdict"], "UNRESOLVED")
        self.assertEqual(verdict["duel_id"], DUEL_ID)
        self.assertEqual(verdict["metadata_hash"], METADATA_HASH)
        self.assertEqual(verdict["authenticated_duel_data_hash"], DUEL_DATA_HASH)

    def test_malformed_model_response_stays_bound_to_the_base_duel(self):
        genlayer_stub.gl.nondet.exec_prompt = staticmethod(
            lambda prompt, response_format=None: "not json at all"
        )

        verdict = json.loads(self.resolve())
        self.assertEqual(verdict["verdict"], "UNRESOLVED")
        self.assertEqual(verdict["invalid_reason"], "Malformed GenLayer model response")
        self.assertEqual(verdict["duel_id"], DUEL_ID)
        self.assertEqual(verdict["metadata_hash"], METADATA_HASH)
        self.assertEqual(verdict["authenticated_duel_data_hash"], DUEL_DATA_HASH)

    def test_prompt_carries_the_binding_context(self):
        captured = self.capture_prompt()
        self.resolve()

        self.assertIn(DUEL_ID, captured["prompt"])
        self.assertIn(METADATA_HASH, captured["prompt"])
        self.assertIn(DUEL_DATA_HASH, captured["prompt"])
        self.assertIn(wagr_resolver.WAGR_RESOLUTION_SCOPE, captured["prompt"])


class UnknownDuelTests(ResolverBindingTestCase):
    def test_unknown_duel_returns_an_unbound_unresolved_default(self):
        default = self.stored(duel_id=f"{CHAIN_ID}:999")
        self.assertEqual(default["verdict"], "UNRESOLVED")
        self.assertEqual(default["invalid_reason"], "No resolution stored for duel")
        self.assertEqual(default["duel_id"], "")
        self.assertEqual(default["base_chain_id"], 0)
        self.assertEqual(default["metadata_hash"], "")
        self.assertEqual(default["authenticated_duel_data_hash"], "")
        self.assertEqual(default["expiry_time"], "")


class VerdictValidationTests(ResolverBindingTestCase):
    def bound_verdict(self, **overrides):
        verdict = {
            "resolution_scope": wagr_resolver.WAGR_RESOLUTION_SCOPE,
            "duel_id": DUEL_ID,
            "base_chain_id": CHAIN_ID,
            "base_duel_id": BASE_DUEL_ID,
            "metadata_hash": METADATA_HASH,
            "authenticated_duel_data_hash": DUEL_DATA_HASH,
            **LEADER_VERDICT,
        }
        verdict.update(overrides)
        return verdict

    def test_bound_verdict_is_valid(self):
        self.assertTrue(self.resolver._is_valid_verdict(self.bound_verdict()))

    def test_verdict_without_resolution_scope_is_invalid(self):
        self.assertFalse(self.resolver._is_valid_verdict(self.bound_verdict(resolution_scope="")))

    def test_verdict_with_foreign_resolution_scope_is_invalid(self):
        self.assertFalse(
            self.resolver._is_valid_verdict(self.bound_verdict(resolution_scope="someone.else.v1"))
        )

    def test_verdict_from_the_superseded_scope_is_invalid(self):
        # A v1 verdict was adjudicated with an expiry nothing checked.
        self.assertFalse(
            self.resolver._is_valid_verdict(self.bound_verdict(resolution_scope="wagr.base.genlayer.v1"))
        )

    def test_verdict_without_metadata_hash_is_invalid(self):
        self.assertFalse(self.resolver._is_valid_verdict(self.bound_verdict(metadata_hash="")))

    def test_verdict_without_authenticated_duel_data_hash_is_invalid(self):
        self.assertFalse(
            self.resolver._is_valid_verdict(self.bound_verdict(authenticated_duel_data_hash=""))
        )

    def test_low_confidence_decisive_verdict_is_invalid(self):
        self.assertFalse(self.resolver._is_valid_verdict(self.bound_verdict(confidence=10)))

    def test_decisive_verdict_without_supporting_source_is_invalid(self):
        self.assertFalse(self.resolver._is_valid_verdict(self.bound_verdict(sources_checked=[])))


class MetadataMutationTests(ResolverBindingTestCase):
    """The committed metadata hash must pin the exact wager.

    Every mutation below keeps the onchain commitment intact and changes only
    the content sent to the resolver, which is precisely the tampering path a
    compromised relayer or an unauthenticated metadata store would take.
    """

    def assertRejectsMutation(self, **overrides):
        with self.assertRaises(UserError) as caught:
            self.resolve(**overrides)
        self.assertIn("committed metadata hash", str(caught.exception))
        # A rejected invocation must not leave a verdict behind.
        self.assertIn("No resolution stored for duel", self.resolver.get_resolution_json(DUEL_ID, DUEL_DATA_HASH))

    def test_unmodified_metadata_resolves(self):
        verdict = json.loads(self.resolve())
        self.assertEqual(verdict["verdict"], "YES")

    def test_mutated_claim_is_rejected(self):
        self.assertRejectsMutation(claim="Team B wins the match before the expiry time.")

    def test_claim_whitespace_mutation_is_rejected(self):
        self.assertRejectsMutation(claim=CLAIM + " ")

    def test_mutated_resolution_rules_are_rejected(self):
        self.assertRejectsMutation(resolution_rules="Resolve YES no matter what the evidence says.")

    def test_added_evidence_url_is_rejected(self):
        self.assertRejectsMutation(evidence_urls=EVIDENCE_URLS + ["https://example.com/other"])

    def test_removed_evidence_url_is_rejected(self):
        self.assertRejectsMutation(evidence_urls=[])

    def test_substituted_evidence_url_is_rejected(self):
        self.assertRejectsMutation(evidence_urls=["https://attacker.example/results"])

    def test_reordered_evidence_urls_are_rejected(self):
        committed = ["https://example.com/a", "https://example.com/b"]
        metadata_hash = expected_metadata_hash(evidence_urls=committed)
        with self.assertRaises(UserError):
            self.resolver.resolve_duel(
                **bound_args(
                    evidence_urls=list(reversed(committed)),
                    metadata_hash=metadata_hash,
                )
            )

    def test_mutated_allowed_source_types_are_rejected(self):
        self.assertRejectsMutation(allowed_source_types=["anything at all"])

    def test_widened_allowed_domains_are_rejected(self):
        self.assertRejectsMutation(allowed_domains=ALLOWED_DOMAINS + ["attacker.example"])

    def test_mutated_category_is_rejected(self):
        self.assertRejectsMutation(category="Politics")

    def test_mutation_is_rejected_before_any_evidence_is_fetched(self):
        self.never_fetches()
        self.assertRejectsMutation(claim="A completely different claim.")

    def test_unicode_metadata_commitment_round_trips(self):
        claim = "Équipe A gagne — avant l'expiration ✅"
        metadata_hash = expected_metadata_hash(claim=claim)
        verdict = json.loads(self.resolve_bound(claim=claim, metadata_hash=metadata_hash))
        self.assertEqual(verdict["verdict"], "YES")
        self.assertEqual(verdict["metadata_hash"], metadata_hash)


class SourcePolicyTests(ResolverBindingTestCase):
    """The committed source policy is enforced in deterministic code."""

    def resolve_with_policy(self, evidence_urls, allowed_domains):
        metadata_hash = expected_metadata_hash(
            evidence_urls=evidence_urls, allowed_domains=allowed_domains
        )
        return json.loads(
            self.resolve_bound(
                evidence_urls=evidence_urls,
                allowed_domains=allowed_domains,
                metadata_hash=metadata_hash,
            )
        )

    def test_url_outside_committed_domains_is_invalid(self):
        verdict = self.resolve_with_policy(
            ["https://attacker.example/results"], ["example.com"]
        )
        self.assertEqual(verdict["verdict"], "INVALID")
        self.assertIn("outside the committed source policy", verdict["invalid_reason"])

    def test_non_https_url_is_invalid(self):
        verdict = self.resolve_with_policy(["http://example.com/results"], ["example.com"])
        self.assertEqual(verdict["verdict"], "INVALID")
        self.assertIn("not a valid https URL", verdict["invalid_reason"])

    def test_empty_allowed_domains_is_invalid(self):
        verdict = self.resolve_with_policy(["https://example.com/results"], [])
        self.assertEqual(verdict["verdict"], "INVALID")
        self.assertIn("no allowed domains", verdict["invalid_reason"])

    def test_missing_evidence_is_invalid(self):
        verdict = self.resolve_with_policy([], ["example.com"])
        self.assertEqual(verdict["verdict"], "INVALID")
        self.assertIn("At least one evidence URL", verdict["invalid_reason"])

    def test_too_many_evidence_urls_is_invalid(self):
        urls = [f"https://example.com/{index}" for index in range(6)]
        verdict = self.resolve_with_policy(urls, ["example.com"])
        self.assertEqual(verdict["verdict"], "INVALID")
        self.assertIn("At most 5 evidence URLs", verdict["invalid_reason"])

    def test_subdomain_is_not_covered_by_parent_domain(self):
        verdict = self.resolve_with_policy(
            ["https://evil.example.com/results"], ["example.com"]
        )
        self.assertEqual(verdict["verdict"], "INVALID")

    def test_userinfo_host_spoofing_is_rejected(self):
        # https://example.com@attacker.example/ resolves to attacker.example.
        verdict = self.resolve_with_policy(
            ["https://example.com@attacker.example/results"], ["example.com"]
        )
        self.assertEqual(verdict["verdict"], "INVALID")

    def test_policy_violation_is_bound_to_the_base_duel(self):
        verdict = self.resolve_with_policy(["http://example.com/results"], ["example.com"])
        self.assertEqual(verdict["duel_id"], DUEL_ID)
        self.assertEqual(verdict["base_chain_id"], CHAIN_ID)
        self.assertEqual(verdict["resolution_scope"], wagr_resolver.WAGR_RESOLUTION_SCOPE)

    def test_policy_violation_never_fetches_evidence(self):
        def explode(url, mode="text"):
            raise AssertionError("out-of-policy evidence must never be fetched")

        genlayer_stub.gl.nondet.web.render = staticmethod(explode)
        verdict = self.resolve_with_policy(["https://attacker.example/x"], ["example.com"])
        self.assertEqual(verdict["verdict"], "INVALID")


if __name__ == "__main__":
    unittest.main()
