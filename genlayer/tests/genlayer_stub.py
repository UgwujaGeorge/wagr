"""Minimal offline stand-in for the GenLayer runtime.

The real `py-genlayer` runtime only exists inside GenVM, so it cannot be
imported in CI. This stub provides just enough of the surface that
`wagr_resolver.py` touches, which lets the resolver's binding and
validation logic be tested as ordinary Python.

Nondeterministic behaviour is injected by the tests through
`gl.nondet.web.render` and `gl.nondet.exec_prompt`.
"""

import json


class _TreeMap(dict):
    """Stand-in for GenLayer's persistent `TreeMap` storage type."""

    def __class_getitem__(cls, _item):
        return cls


TreeMap = _TreeMap


class _UserError(Exception):
    pass


class _Return:
    def __init__(self, calldata):
        self.calldata = calldata


def _run_nondet_unsafe(leader_fn, validator_fn):
    """Run the leader, then hold its output to the validator's rules.

    The real runtime runs these across validators. Here a single in-process
    round is enough to exercise the equivalence and validity checks.
    """
    leader_result = leader_fn()
    calldata = json.dumps(leader_result, sort_keys=True) if isinstance(leader_result, dict) else leader_result
    if not validator_fn(_Return(calldata)):
        raise _UserError("Validators did not agree on the leader result")
    return leader_result


class _Vm:
    UserError = _UserError
    Return = _Return
    run_nondet_unsafe = staticmethod(_run_nondet_unsafe)


class _Web:
    @staticmethod
    def render(url, mode="text"):  # noqa: ARG004 - overridden per test
        raise AssertionError("gl.nondet.web.render was not stubbed for this test")


class _Nondet:
    web = _Web

    @staticmethod
    def exec_prompt(prompt, response_format=None):  # noqa: ARG004 - overridden per test
        raise AssertionError("gl.nondet.exec_prompt was not stubbed for this test")


def _identity(fn):
    return fn


class _Public:
    write = staticmethod(_identity)
    view = staticmethod(_identity)


class _Contract:
    pass


class gl:  # noqa: N801 - mirrors the runtime's lowercase namespace
    Contract = _Contract
    public = _Public
    vm = _Vm
    nondet = _Nondet
