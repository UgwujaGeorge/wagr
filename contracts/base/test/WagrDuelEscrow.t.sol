// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/WagrDuelEscrow.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
    function prank(address msgSender) external;
    function expectRevert(bytes4 revertData) external;
    function warp(uint256 newTimestamp) external;
    function addr(uint256 privateKey) external pure returns (address);
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
}

contract WagrDuelEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    WagrDuelEscrow private escrow;

    address private owner = address(0xA11CE);
    address private creator = address(0xC0FFEE);
    address private counterparty = address(0xD00D);
    address private stranger = address(0xBAD);

    // Three independent attesters, 2-of-3.
    uint256 private constant ATTESTER_A_KEY = 0xA1;
    uint256 private constant ATTESTER_B_KEY = 0xB2;
    uint256 private constant ATTESTER_C_KEY = 0xC3;
    // Stands in for the old single relayer key the steward called out.
    uint256 private constant RELAYER_KEY = 0xBEEF;

    uint256 private constant CHALLENGE_WINDOW = 1 hours;
    uint256 private constant GRACE_PERIOD = 3 days;

    /// Reimplemented rather than read from the contract, so a change to the
    /// signed struct has to be made deliberately in two places.
    bytes32 private constant VERDICT_TYPEHASH = keccak256(
        "Verdict(uint256 duelId,uint8 verdict,uint16 confidenceBps,bytes32 metadataHash,bytes32 authenticatedDuelDataHash,bytes32 verdictHash,bytes32 genlayerTxHash)"
    );

    bytes32 private constant META = keccak256("wagr metadata");
    bytes32 private constant VERDICT_HASH = keccak256("genlayer verdict");
    bytes32 private constant GENLAYER_TX = keccak256("genlayer tx");

    function setUp() public {
        address[] memory initial = new address[](3);
        initial[0] = vm.addr(ATTESTER_A_KEY);
        initial[1] = vm.addr(ATTESTER_B_KEY);
        initial[2] = vm.addr(ATTESTER_C_KEY);

        escrow = new WagrDuelEscrow(owner, initial, 2, CHALLENGE_WINDOW, GRACE_PERIOD);
        vm.deal(creator, 10 ether);
        vm.deal(counterparty, 10 ether);
        vm.deal(stranger, 10 ether);
    }

    // ------------------------------------------------------------ lifecycle

    function testCreateDuel() public {
        uint256 expiry = block.timestamp + 1 days;

        vm.prank(creator);
        uint256 duelId = escrow.createDuel{value: 1 ether}(WagrDuelEscrow.Side.Yes, expiry, META);

        WagrDuelEscrow.Duel memory duel = escrow.getDuel(duelId);
        assertEq(duelId, 1);
        assertEq(duel.creator, creator);
        assertEq(uint256(duel.creatorSide), uint256(WagrDuelEscrow.Side.Yes));
        assertEq(duel.stakeAmount, 1 ether);
        assertEq(uint256(duel.status), uint256(WagrDuelEscrow.DuelStatus.Open));
    }

    function testAcceptDuel() public {
        uint256 duelId = _openDuel();

        vm.prank(counterparty);
        escrow.acceptDuel{value: 1 ether}(duelId);

        WagrDuelEscrow.Duel memory duel = escrow.getDuel(duelId);
        assertEq(duel.counterparty, counterparty);
        assertEq(uint256(duel.status), uint256(WagrDuelEscrow.DuelStatus.Active));
    }

    function testCreatorCannotAcceptOwnDuel() public {
        uint256 duelId = _openDuel();

        vm.prank(creator);
        vm.expectRevert(WagrDuelEscrow.CreatorCannotAccept.selector);
        escrow.acceptDuel{value: 1 ether}(duelId);
    }

    function testAcceptRequiresMatchingStake() public {
        uint256 duelId = _openDuel();

        vm.prank(counterparty);
        vm.expectRevert(WagrDuelEscrow.IncorrectStake.selector);
        escrow.acceptDuel{value: 0.5 ether}(duelId);
    }

    function testCancelOpenDuelRefundsCreator() public {
        uint256 duelId = _openDuel();
        uint256 before = creator.balance;

        vm.prank(creator);
        escrow.cancelOpenDuel(duelId);

        assertEq(creator.balance, before + 1 ether);
        assertEq(uint256(escrow.getDuel(duelId).status), uint256(WagrDuelEscrow.DuelStatus.Canceled));
    }

    // ------------------------------------------------- quorum authorization

    function testQuorumVerdictYesPaysCreator() public {
        uint256 duelId = _activeExpiredDuel();
        _proposeVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, _twoAttesters());
        _passChallengeWindow();
        escrow.finalizeVerdict(duelId);

        uint256 before = creator.balance;
        vm.prank(creator);
        escrow.claimPayout(duelId);

        assertEq(creator.balance, before + 2 ether);
        assertEq(uint256(escrow.getDuel(duelId).status), uint256(WagrDuelEscrow.DuelStatus.Paid));
    }

    function testQuorumVerdictNoPaysCounterparty() public {
        uint256 duelId = _activeExpiredDuel();
        _proposeVerdict(duelId, WagrDuelEscrow.Verdict.No, 8_500, _twoAttesters());
        _passChallengeWindow();
        escrow.finalizeVerdict(duelId);

        uint256 before = counterparty.balance;
        vm.prank(counterparty);
        escrow.claimPayout(duelId);

        assertEq(counterparty.balance, before + 2 ether);
    }

    function testInvalidVerdictRefundsBothSides() public {
        uint256 duelId = _activeExpiredDuel();
        _proposeVerdict(duelId, WagrDuelEscrow.Verdict.Invalid, 4_000, _twoAttesters());
        _passChallengeWindow();
        escrow.finalizeVerdict(duelId);

        uint256 creatorBefore = creator.balance;
        uint256 counterpartyBefore = counterparty.balance;

        vm.prank(creator);
        escrow.claimRefund(duelId);
        vm.prank(counterparty);
        escrow.claimRefund(duelId);

        assertEq(creator.balance, creatorBefore + 1 ether);
        assertEq(counterparty.balance, counterpartyBefore + 1 ether);
        assertEq(uint256(escrow.getDuel(duelId).status), uint256(WagrDuelEscrow.DuelStatus.Paid));
    }

    /// The steward's case: the relayer key on its own is no longer authorization.
    function testRelayerKeyAloneCannotSubmitVerdict() public {
        uint256 duelId = _activeExpiredDuel();
        uint256[] memory keys = new uint256[](1);
        keys[0] = RELAYER_KEY;

        bytes[] memory signatures = _sigsFor(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, keys);

        vm.expectRevert(WagrDuelEscrow.InsufficientAttestations.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    function testVerdictWithNoSignaturesIsRejected() public {
        uint256 duelId = _activeExpiredDuel();

        bytes[] memory signatures =
            _sigsFor(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, new uint256[](0));

        vm.expectRevert(WagrDuelEscrow.InsufficientAttestations.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    function testVerdictBelowThresholdIsRejected() public {
        uint256 duelId = _activeExpiredDuel();
        uint256[] memory keys = new uint256[](1);
        keys[0] = ATTESTER_A_KEY;

        bytes[] memory signatures = _sigsFor(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, keys);

        vm.expectRevert(WagrDuelEscrow.InsufficientAttestations.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    function testDuplicateAttesterSignatureIsRejected() public {
        uint256 duelId = _activeExpiredDuel();
        uint256[] memory keys = new uint256[](2);
        keys[0] = ATTESTER_A_KEY;
        keys[1] = ATTESTER_A_KEY;

        bytes[] memory signatures = _sigsFor(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, keys);

        vm.expectRevert(WagrDuelEscrow.UnorderedSignatures.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    function testNonAttesterSignatureIsRejected() public {
        uint256 duelId = _activeExpiredDuel();
        uint256[] memory keys = new uint256[](2);
        keys[0] = ATTESTER_A_KEY;
        keys[1] = RELAYER_KEY;

        bytes[] memory signatures = _sigsFor(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, keys);

        vm.expectRevert(WagrDuelEscrow.NotAnAttester.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    /// An attestation for duel 1 must not settle duel 2.
    function testAttestationForAnotherDuelIsRejected() public {
        uint256 duelId = _activeExpiredDuel();
        uint256 otherDuelId = _activeExpiredDuel();

        bytes32 digest =
            escrow.verdictDigest(otherDuelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX);
        bytes[] memory signatures = _signSorted(_twoAttesters(), digest);

        vm.expectRevert(WagrDuelEscrow.NotAnAttester.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    /// Signing YES does not authorize submitting NO.
    function testAttestationForAnotherVerdictIsRejected() public {
        uint256 duelId = _activeExpiredDuel();

        bytes32 digest =
            escrow.verdictDigest(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX);
        bytes[] memory signatures = _signSorted(_twoAttesters(), digest);

        vm.expectRevert(WagrDuelEscrow.NotAnAttester.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.No, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    function testVerdictSubmissionRequiresDuelMetadataHash() public {
        uint256 duelId = _activeExpiredDuel();
        bytes32 wrongMeta = keccak256("different metadata");

        bytes[] memory signatures =
            _sigsFor(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, wrongMeta, VERDICT_HASH, GENLAYER_TX, _twoAttesters());

        vm.expectRevert(WagrDuelEscrow.MetadataHashMismatch.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, wrongMeta, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    /// An attestation minted against a different escrow deployment must not
    /// replay here, even with the same attesters and the same duel numbering.
    function testAttestationFromAnotherEscrowIsRejected() public {
        uint256 duelId = _activeExpiredDuel();

        address[] memory initial = new address[](3);
        initial[0] = vm.addr(ATTESTER_A_KEY);
        initial[1] = vm.addr(ATTESTER_B_KEY);
        initial[2] = vm.addr(ATTESTER_C_KEY);
        WagrDuelEscrow other = new WagrDuelEscrow(owner, initial, 2, CHALLENGE_WINDOW, GRACE_PERIOD);

        bytes32 foreignDigest =
            other.verdictDigest(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX);
        bytes[] memory signatures = _signSorted(_twoAttesters(), foreignDigest);

        vm.expectRevert(WagrDuelEscrow.NotAnAttester.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    function testSignaturesMustBeSortedBySigner() public {
        uint256 duelId = _activeExpiredDuel();
        bytes32 digest =
            escrow.verdictDigest(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX);

        bytes[] memory sorted = _signSorted(_twoAttesters(), digest);
        bytes[] memory reversed = new bytes[](2);
        reversed[0] = sorted[1];
        reversed[1] = sorted[0];

        vm.expectRevert(WagrDuelEscrow.UnorderedSignatures.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, reversed);
    }

    function testRemovedAttesterCanNoLongerAuthorize() public {
        vm.prank(owner);
        escrow.removeAttester(vm.addr(ATTESTER_A_KEY));

        uint256 duelId = _activeExpiredDuel();

        bytes[] memory signatures =
            _sigsFor(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, _twoAttesters());

        vm.expectRevert(WagrDuelEscrow.NotAnAttester.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    function testGenLayerTxHashIsRequired() public {
        uint256 duelId = _activeExpiredDuel();

        bytes[] memory signatures =
            _sigsFor(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, bytes32(0), _twoAttesters());

        vm.expectRevert(WagrDuelEscrow.InvalidGenLayerTxHash.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, bytes32(0), signatures);
    }

    function testCannotSubmitVerdictBeforeExpiry() public {
        uint256 duelId = _openDuel();
        vm.prank(counterparty);
        escrow.acceptDuel{value: 1 ether}(duelId);

        bytes[] memory signatures =
            _sigsFor(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, _twoAttesters());

        vm.expectRevert(WagrDuelEscrow.InvalidStatus.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    function testCannotSubmitVerdictTwice() public {
        uint256 duelId = _activeExpiredDuel();
        _proposeVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, _twoAttesters());

        bytes[] memory signatures =
            _sigsFor(duelId, WagrDuelEscrow.Verdict.No, 8_500, META, VERDICT_HASH, GENLAYER_TX, _twoAttesters());

        vm.expectRevert(WagrDuelEscrow.InvalidStatus.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.No, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    // ----------------------------------------------------- expiry binding

    /// The expiry is inside the data attesters sign, not alongside it.
    function testDuelStateHashCommitsToTheExpiry() public {
        uint256 duelId = _activeExpiredDuel();
        WagrDuelEscrow.Duel memory duel = escrow.getDuel(duelId);

        assertEq(escrow.duelStateHash(duelId), _duelStateHashWithExpiry(duelId, duel, duel.expiry));
        assertNotEq(escrow.duelStateHash(duelId), _duelStateHashWithExpiry(duelId, duel, duel.expiry + 1));
        assertNotEq(escrow.duelStateHash(duelId), _duelStateHashWithExpiry(duelId, duel, duel.expiry + 30 days));
    }

    /// Proves the hand-built digest below really is the one the escrow checks,
    /// so the altered-expiry rejection that follows is about the expiry and
    /// not about a mis-assembled struct.
    function testAttestationOverTheRealDuelStateIsAccepted() public {
        uint256 duelId = _activeExpiredDuel();
        WagrDuelEscrow.Duel memory duel = escrow.getDuel(duelId);

        bytes32 digest = _digestOver(duelId, _duelStateHashWithExpiry(duelId, duel, duel.expiry));
        bytes[] memory signatures = _signSorted(_twoAttesters(), digest);

        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
        assertEq(uint256(escrow.getDuel(duelId).status), uint256(WagrDuelEscrow.DuelStatus.VerdictProposed));
    }

    /// An attester that judged the duel against a later expiry -- the
    /// difference between "closed before Friday" and "closed before next
    /// month" -- produces a signature this escrow cannot recognize at all.
    function testAttestationOverAnAlteredExpiryIsRejected() public {
        uint256 duelId = _activeExpiredDuel();
        WagrDuelEscrow.Duel memory duel = escrow.getDuel(duelId);

        bytes32 digest = _digestOver(duelId, _duelStateHashWithExpiry(duelId, duel, duel.expiry + 30 days));
        bytes[] memory signatures = _signSorted(_twoAttesters(), digest);

        vm.expectRevert(WagrDuelEscrow.NotAnAttester.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    function testAttestationOverAnEarlierExpiryIsRejected() public {
        uint256 duelId = _activeExpiredDuel();
        WagrDuelEscrow.Duel memory duel = escrow.getDuel(duelId);

        bytes32 digest = _digestOver(duelId, _duelStateHashWithExpiry(duelId, duel, duel.expiry - 1));
        bytes[] memory signatures = _signSorted(_twoAttesters(), digest);

        vm.expectRevert(WagrDuelEscrow.NotAnAttester.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    /// A rejected altered-expiry submission must not consume the duel's one
    /// shot at settlement.
    function testDuelStillSettlesAfterAnAlteredExpirySubmissionFails() public {
        uint256 duelId = _activeExpiredDuel();
        WagrDuelEscrow.Duel memory duel = escrow.getDuel(duelId);

        bytes32 forged = _digestOver(duelId, _duelStateHashWithExpiry(duelId, duel, duel.expiry + 30 days));
        bytes[] memory forgedSignatures = _signSorted(_twoAttesters(), forged);
        vm.expectRevert(WagrDuelEscrow.NotAnAttester.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, forgedSignatures);

        _proposeVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, _twoAttesters());
        _passChallengeWindow();
        escrow.finalizeVerdict(duelId);
        assertEq(uint256(escrow.getDuel(duelId).status), uint256(WagrDuelEscrow.DuelStatus.Resolved));
    }

    // ------------------------------------------------- public caller safety

    function testResolutionCannotBeRequestedBeforeExpiry() public {
        uint256 duelId = _openDuel();
        vm.prank(counterparty);
        escrow.acceptDuel{value: 1 ether}(duelId);

        vm.prank(stranger);
        vm.expectRevert(WagrDuelEscrow.DuelNotExpired.selector);
        escrow.markResolutionRequested(duelId);
    }

    /// Requesting resolution is permissionless on purpose, so settlement never
    /// depends on one party staying online. Being the caller must therefore
    /// confer nothing: the duel settles exactly as it would have.
    function testStrangerRequestingResolutionDoesNotOccupyTheDuel() public {
        uint256 duelId = _openDuel();
        vm.prank(counterparty);
        escrow.acceptDuel{value: 1 ether}(duelId);
        vm.warp(escrow.getDuel(duelId).expiry + 1);

        vm.prank(stranger);
        escrow.markResolutionRequested(duelId);

        _proposeVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, _twoAttesters());
        _passChallengeWindow();
        escrow.finalizeVerdict(duelId);

        uint256 before = creator.balance;
        vm.prank(creator);
        escrow.claimPayout(duelId);
        assertEq(creator.balance, before + 2 ether);
    }

    /// And a stranger who requests resolution cannot strand the stakes either:
    /// the timeout refund is still reachable from ResolutionRequested.
    function testStrangerRequestedDuelStillTimesOut() public {
        uint256 duelId = _activeExpiredDuel();
        vm.warp(block.timestamp + GRACE_PERIOD + 1);

        vm.prank(stranger);
        escrow.markResolutionTimedOut(duelId);

        assertEq(uint256(escrow.getDuel(duelId).status), uint256(WagrDuelEscrow.DuelStatus.Invalid));
    }

    // -------------------------------------------------------- challenge path

    function testProposedVerdictIsNotClaimableDuringWindow() public {
        uint256 duelId = _activeExpiredDuel();
        _proposeVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, _twoAttesters());

        vm.prank(creator);
        vm.expectRevert(WagrDuelEscrow.InvalidStatus.selector);
        escrow.claimPayout(duelId);
    }

    function testFinalizeBeforeWindowClosesIsRejected() public {
        uint256 duelId = _activeExpiredDuel();
        _proposeVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, _twoAttesters());

        vm.expectRevert(WagrDuelEscrow.ChallengeWindowOpen.selector);
        escrow.finalizeVerdict(duelId);
    }

    function testParticipantCanChallengeAndUnanimityFinalizes() public {
        uint256 duelId = _activeExpiredDuel();
        _proposeVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, _twoAttesters());

        vm.prank(counterparty);
        escrow.challengeVerdict(duelId);
        assertEq(uint256(escrow.getDuel(duelId).status), uint256(WagrDuelEscrow.DuelStatus.Challenged));

        _submit(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, _allAttesters());
        assertEq(uint256(escrow.getDuel(duelId).status), uint256(WagrDuelEscrow.DuelStatus.Resolved));
    }

    function testChallengedDuelRejectsMerelyThresholdAttestations() public {
        uint256 duelId = _activeExpiredDuel();
        _proposeVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, _twoAttesters());

        vm.prank(counterparty);
        escrow.challengeVerdict(duelId);

        bytes[] memory signatures =
            _sigsFor(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, _twoAttesters());

        vm.expectRevert(WagrDuelEscrow.InsufficientAttestations.selector);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, META, VERDICT_HASH, GENLAYER_TX, signatures);
    }

    function testStrangerCannotChallenge() public {
        uint256 duelId = _activeExpiredDuel();
        _proposeVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, _twoAttesters());

        vm.prank(stranger);
        vm.expectRevert(WagrDuelEscrow.NotParticipant.selector);
        escrow.challengeVerdict(duelId);
    }

    function testChallengeAfterWindowIsRejected() public {
        uint256 duelId = _activeExpiredDuel();
        _proposeVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, _twoAttesters());
        _passChallengeWindow();

        vm.prank(counterparty);
        vm.expectRevert(WagrDuelEscrow.ChallengeWindowClosed.selector);
        escrow.challengeVerdict(duelId);
    }

    function testUnansweredChallengeRefundsBothSides() public {
        uint256 duelId = _activeExpiredDuel();
        _proposeVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, _twoAttesters());

        vm.prank(counterparty);
        escrow.challengeVerdict(duelId);
        _passChallengeWindow();
        escrow.finalizeChallenge(duelId);

        uint256 creatorBefore = creator.balance;
        vm.prank(creator);
        escrow.claimRefund(duelId);
        assertEq(creator.balance, creatorBefore + 1 ether);
    }

    // ---------------------------------------------------------- timeout path

    function testTimeoutRefundBeforeGracePeriodIsRejected() public {
        uint256 duelId = _activeExpiredDuel();

        vm.expectRevert(WagrDuelEscrow.GracePeriodNotElapsed.selector);
        escrow.markResolutionTimedOut(duelId);
    }

    function testTimeoutRefundReleasesStrandedStakes() public {
        uint256 duelId = _activeExpiredDuel();
        vm.warp(block.timestamp + GRACE_PERIOD + 1);
        escrow.markResolutionTimedOut(duelId);

        uint256 creatorBefore = creator.balance;
        uint256 counterpartyBefore = counterparty.balance;

        vm.prank(creator);
        escrow.claimRefund(duelId);
        vm.prank(counterparty);
        escrow.claimRefund(duelId);

        assertEq(creator.balance, creatorBefore + 1 ether);
        assertEq(counterparty.balance, counterpartyBefore + 1 ether);
    }

    // ---------------------------------------------------------------- claims

    function testLoserCannotClaimPayout() public {
        uint256 duelId = _resolvedDuel(WagrDuelEscrow.Verdict.Yes);

        vm.prank(counterparty);
        vm.expectRevert(WagrDuelEscrow.NotWinner.selector);
        escrow.claimPayout(duelId);
    }

    function testWinnerCannotClaimPayoutTwice() public {
        uint256 duelId = _resolvedDuel(WagrDuelEscrow.Verdict.Yes);

        vm.prank(creator);
        escrow.claimPayout(duelId);

        vm.prank(creator);
        vm.expectRevert(WagrDuelEscrow.InvalidStatus.selector);
        escrow.claimPayout(duelId);
    }

    function testRefundCannotBeClaimedTwice() public {
        uint256 duelId = _resolvedDuel(WagrDuelEscrow.Verdict.Invalid);

        vm.prank(creator);
        escrow.claimRefund(duelId);

        vm.prank(creator);
        vm.expectRevert(WagrDuelEscrow.AlreadyClaimed.selector);
        escrow.claimRefund(duelId);
    }

    function testThresholdCannotExceedAttesterCount() public {
        vm.prank(owner);
        vm.expectRevert(WagrDuelEscrow.InvalidThreshold.selector);
        escrow.setThreshold(4);
    }

    // --------------------------------------------------------------- helpers

    function _openDuel() private returns (uint256 duelId) {
        vm.prank(creator);
        duelId = escrow.createDuel{value: 1 ether}(WagrDuelEscrow.Side.Yes, block.timestamp + 1 days, META);
    }

    function _activeExpiredDuel() private returns (uint256 duelId) {
        duelId = _openDuel();
        vm.prank(counterparty);
        escrow.acceptDuel{value: 1 ether}(duelId);
        vm.warp(escrow.getDuel(duelId).expiry + 1);
        escrow.markResolutionRequested(duelId);
    }

    function _resolvedDuel(WagrDuelEscrow.Verdict verdict) private returns (uint256 duelId) {
        duelId = _activeExpiredDuel();
        _proposeVerdict(duelId, verdict, 8_500, _twoAttesters());
        _passChallengeWindow();
        escrow.finalizeVerdict(duelId);
    }

    function _proposeVerdict(uint256 duelId, WagrDuelEscrow.Verdict verdict, uint16 bps, uint256[] memory keys)
        private
    {
        _submit(duelId, verdict, bps, META, VERDICT_HASH, GENLAYER_TX, keys);
    }

    /// Builds the attestation set without touching `submitVerdict`, so revert
    /// paths can arm `vm.expectRevert` against the submission alone.
    function _sigsFor(
        uint256 duelId,
        WagrDuelEscrow.Verdict verdict,
        uint16 bps,
        bytes32 metadataHash,
        bytes32 verdictHash,
        bytes32 genlayerTxHash,
        uint256[] memory keys
    ) private view returns (bytes[] memory) {
        return _signSorted(keys, escrow.verdictDigest(duelId, verdict, bps, metadataHash, verdictHash, genlayerTxHash));
    }

    function _submit(
        uint256 duelId,
        WagrDuelEscrow.Verdict verdict,
        uint16 bps,
        bytes32 metadataHash,
        bytes32 verdictHash,
        bytes32 genlayerTxHash,
        uint256[] memory keys
    ) private {
        bytes32 digest = escrow.verdictDigest(duelId, verdict, bps, metadataHash, verdictHash, genlayerTxHash);
        escrow.submitVerdict(duelId, verdict, bps, metadataHash, verdictHash, genlayerTxHash, _signSorted(keys, digest));
    }

    function _passChallengeWindow() private {
        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);
    }

    function _twoAttesters() private pure returns (uint256[] memory keys) {
        keys = new uint256[](2);
        keys[0] = ATTESTER_A_KEY;
        keys[1] = ATTESTER_B_KEY;
    }

    function _allAttesters() private pure returns (uint256[] memory keys) {
        keys = new uint256[](3);
        keys[0] = ATTESTER_A_KEY;
        keys[1] = ATTESTER_B_KEY;
        keys[2] = ATTESTER_C_KEY;
    }

    /// Signs `digest` with every key, ordered by ascending signer address as
    /// the escrow requires. Duplicate keys are left in place so the duplicate
    /// rejection path stays testable.
    function _signSorted(uint256[] memory keys, bytes32 digest) private pure returns (bytes[] memory signatures) {
        uint256 length = keys.length;
        uint256[] memory ordered = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            ordered[i] = keys[i];
        }
        for (uint256 i = 1; i < length; i++) {
            uint256 key = ordered[i];
            uint256 j = i;
            while (j > 0 && uint160(vm.addr(ordered[j - 1])) > uint160(vm.addr(key))) {
                ordered[j] = ordered[j - 1];
                j--;
            }
            ordered[j] = key;
        }

        signatures = new bytes[](length);
        for (uint256 i = 0; i < length; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(ordered[i], digest);
            signatures[i] = abi.encodePacked(r, s, v);
        }
    }

    /// The duel state hash the escrow would produce if the expiry were
    /// `expiry`, rebuilt from the same nine fields rather than borrowed.
    function _duelStateHashWithExpiry(uint256 duelId, WagrDuelEscrow.Duel memory duel, uint256 expiry)
        private
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                block.chainid,
                address(escrow),
                duelId,
                duel.creator,
                duel.counterparty,
                uint8(duel.creatorSide),
                duel.stakeAmount,
                expiry,
                duel.metadataHash
            )
        );
    }

    /// The EIP-712 digest for a YES verdict over an arbitrary duel state hash.
    function _digestOver(uint256 duelId, bytes32 duelStateHash) private view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                VERDICT_TYPEHASH,
                duelId,
                uint8(WagrDuelEscrow.Verdict.Yes),
                uint16(8_500),
                META,
                duelStateHash,
                VERDICT_HASH,
                GENLAYER_TX
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
    }

    function assertEq(uint256 actual, uint256 expected) private pure {
        require(actual == expected, "assertEq(uint256) failed");
    }

    function assertEq(address actual, address expected) private pure {
        require(actual == expected, "assertEq(address) failed");
    }

    function assertEq(bytes32 actual, bytes32 expected) private pure {
        require(actual == expected, "assertEq(bytes32) failed");
    }

    function assertNotEq(bytes32 actual, bytes32 unexpected) private pure {
        require(actual != unexpected, "assertNotEq(bytes32) failed");
    }
}
