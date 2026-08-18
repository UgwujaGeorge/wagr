"""Adversarial tests for the Wagr GenLayer resolver's Base duel binding.

Every resolver invocation must be bound to one specific Base duel: its
chain, its duel ID, its metadata hash, and the hash of the authenticated
duel data read from the Base escrow. These tests drive the paths a
malicious or careless caller would take.
"""

import hashlib
import importlib.util
import json
import sys
import unittest
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
DUEL_DATA_HASH = "0x" + "22" * 32

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

VALID_ARGS = {
    "duel_id": DUEL_ID,
    "base_chain_id": CHAIN_ID,
    "base_duel_id": BASE_DUEL_ID,
    "authenticated_duel_data_hash": DUEL_DATA_HASH,
    "claim": CLAIM,
    "resolution_rules": RULES,
    "expiry_time": "2026-01-01T00:00:00Z",
    "evidence_urls": EVIDENCE_URLS,
    "allowed_source_types": ALLOWED_SOURCE_TYPES,
    "allowed_domains": ALLOWED_DOMAINS,
    "category": CATEGORY,
    "creator_side": "YES",
    "counterparty_side": "NO",
    "metadata_hash": METADATA_HASH,
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
    "resolved_at": "2026-01-01T00:00:01Z",
    "invalid_reason": "",
}


def call_args(**overrides):
    args = dict(VALID_ARGS)
    args.update(overrides)
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


class PreResolvedDuelTests(ResolverBindingTestCase):
    def test_pre_resolved_duel_cannot_be_resolved_again(self):
        first = json.loads(self.resolve())
        self.assertEqual(first["verdict"], "YES")

        with self.assertRaises(UserError) as caught:
            self.resolve()
        self.assertIn("already resolved", str(caught.exception))

    def test_pre_resolved_duel_keeps_its_original_verdict(self):
        stored = json.loads(self.resolve())

        genlayer_stub.gl.nondet.exec_prompt = staticmethod(
            lambda prompt, response_format=None: json.dumps({**LEADER_VERDICT, "verdict": "NO"})
        )
        with self.assertRaises(UserError):
            self.resolve()

        self.assertEqual(json.loads(self.resolver.get_resolution_json(DUEL_ID)), stored)

    def test_resolving_a_different_duel_is_not_blocked(self):
        self.resolve()
        other_duel = self.resolve(duel_id=f"{CHAIN_ID}:8", base_duel_id="8")
        self.assertEqual(json.loads(other_duel)["base_duel_id"], "8")


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
        stored = json.loads(self.resolver.get_resolution_json(DUEL_ID))
        self.assertEqual(returned, stored)

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
        captured = {}

        def capture_prompt(prompt, response_format=None):
            captured["prompt"] = prompt
            return json.dumps(LEADER_VERDICT)

        genlayer_stub.gl.nondet.exec_prompt = staticmethod(capture_prompt)
        self.resolve()

        self.assertIn(DUEL_ID, captured["prompt"])
        self.assertIn(METADATA_HASH, captured["prompt"])
        self.assertIn(DUEL_DATA_HASH, captured["prompt"])
        self.assertIn(wagr_resolver.WAGR_RESOLUTION_SCOPE, captured["prompt"])


class UnknownDuelTests(ResolverBindingTestCase):
    def test_unknown_duel_returns_an_unbound_unresolved_default(self):
        default = json.loads(self.resolver.get_resolution_json(f"{CHAIN_ID}:999"))
        self.assertEqual(default["verdict"], "UNRESOLVED")
        self.assertEqual(default["invalid_reason"], "No resolution stored for duel")
        self.assertEqual(default["duel_id"], "")
        self.assertEqual(default["base_chain_id"], 0)
        self.assertEqual(default["metadata_hash"], "")
        self.assertEqual(default["authenticated_duel_data_hash"], "")


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


if __name__ == "__main__":
    unittest.main()


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
        self.assertIn("No resolution stored for duel", self.resolver.get_resolution_json(DUEL_ID))

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
            self.resolve(evidence_urls=list(reversed(committed)), metadata_hash=metadata_hash)

    def test_mutated_allowed_source_types_are_rejected(self):
        self.assertRejectsMutation(allowed_source_types=["anything at all"])

    def test_widened_allowed_domains_are_rejected(self):
        self.assertRejectsMutation(allowed_domains=ALLOWED_DOMAINS + ["attacker.example"])

    def test_mutated_category_is_rejected(self):
        self.assertRejectsMutation(category="Politics")

    def test_mutation_is_rejected_before_any_evidence_is_fetched(self):
        def explode(url, mode="text"):
            raise AssertionError("evidence must not be fetched for tampered metadata")

        genlayer_stub.gl.nondet.web.render = staticmethod(explode)
        self.assertRejectsMutation(claim="A completely different claim.")

    def test_unicode_metadata_commitment_round_trips(self):
        claim = "Équipe A gagne — avant l'expiration ✅"
        verdict = json.loads(
            self.resolve(claim=claim, metadata_hash=expected_metadata_hash(claim=claim))
        )
        self.assertEqual(verdict["verdict"], "YES")
        self.assertEqual(verdict["metadata_hash"], expected_metadata_hash(claim=claim))


class SourcePolicyTests(ResolverBindingTestCase):
    """The committed source policy is enforced in deterministic code."""

    def resolve_with_policy(self, evidence_urls, allowed_domains):
        metadata_hash = expected_metadata_hash(
            evidence_urls=evidence_urls, allowed_domains=allowed_domains
        )
        return json.loads(
            self.resolve(
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
        self.assertEqual(verdict["authenticated_duel_data_hash"], DUEL_DATA_HASH)
        self.assertEqual(verdict["resolution_scope"], wagr_resolver.WAGR_RESOLUTION_SCOPE)

    def test_policy_violation_never_fetches_evidence(self):
        def explode(url, mode="text"):
            raise AssertionError("out-of-policy evidence must never be fetched")

        genlayer_stub.gl.nondet.web.render = staticmethod(explode)
        verdict = self.resolve_with_policy(["https://attacker.example/x"], ["example.com"])
        self.assertEqual(verdict["verdict"], "INVALID")
