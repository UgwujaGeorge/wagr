"""Adversarial tests for the Wagr GenLayer resolver's Base duel binding.

Every resolver invocation must be bound to one specific Base duel: its
chain, its duel ID, its metadata hash, and the hash of the authenticated
duel data read from the Base escrow. These tests drive the paths a
malicious or careless caller would take.
"""

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
METADATA_HASH = "0x" + "11" * 32
DUEL_DATA_HASH = "0x" + "22" * 32

VALID_ARGS = {
    "duel_id": DUEL_ID,
    "base_chain_id": CHAIN_ID,
    "base_duel_id": BASE_DUEL_ID,
    "authenticated_duel_data_hash": DUEL_DATA_HASH,
    "claim": "Team A wins the match before the expiry time.",
    "resolution_rules": "Resolve YES only if an official result page reports a Team A win.",
    "expiry_time": "2026-01-01T00:00:00Z",
    "evidence_urls": ["https://example.com/results"],
    "allowed_source_types": ["official"],
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
