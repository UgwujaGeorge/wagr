// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/WagrDuelEscrow.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
    function prank(address msgSender) external;
    function expectRevert(bytes4 revertData) external;
    function warp(uint256 newTimestamp) external;
}

contract WagrDuelEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    WagrDuelEscrow private escrow;

    address private owner = address(0xA11CE);
    address private resolver = address(0xB0B);
    address private creator = address(0xC0FFEE);
    address private counterparty = address(0xD00D);
    address private stranger = address(0xBAD);
    bytes32 private constant META = keccak256("wagr metadata");
    bytes32 private constant VERDICT_HASH = keccak256("genlayer verdict");

    function setUp() public {
        escrow = new WagrDuelEscrow(owner, resolver);
        vm.deal(creator, 10 ether);
        vm.deal(counterparty, 10 ether);
        vm.deal(stranger, 10 ether);
    }

    function testCreateDuel() public {
        uint256 expiry = block.timestamp + 1 days;

        vm.prank(creator);
        uint256 duelId = escrow.createDuel{value: 1 ether}(WagrDuelEscrow.Side.Yes, expiry, META);

        WagrDuelEscrow.Duel memory duel = escrow.getDuel(duelId);
        assertEq(duelId, 1);
        assertEq(duel.creator, creator);
        assertEq(uint256(duel.creatorSide), uint256(WagrDuelEscrow.Side.Yes));
        assertEq(duel.stakeAmount, 1 ether);
        assertEq(duel.expiry, expiry);
        assertEq(uint256(duel.status), uint256(WagrDuelEscrow.DuelStatus.Open));
        assertEq(address(escrow).balance, 1 ether);
    }

    function testAcceptDuel() public {
        uint256 duelId = _createDefaultDuel(WagrDuelEscrow.Side.Yes);

        vm.prank(counterparty);
        escrow.acceptDuel{value: 1 ether}(duelId);

        WagrDuelEscrow.Duel memory duel = escrow.getDuel(duelId);
        assertEq(duel.counterparty, counterparty);
        assertEq(uint256(duel.status), uint256(WagrDuelEscrow.DuelStatus.Active));
        assertEq(address(escrow).balance, 2 ether);
    }

    function testCreatorCannotAcceptOwnDuel() public {
        uint256 duelId = _createDefaultDuel(WagrDuelEscrow.Side.Yes);

        vm.expectRevert(WagrDuelEscrow.CreatorCannotAccept.selector);
        vm.prank(creator);
        escrow.acceptDuel{value: 1 ether}(duelId);
    }

    function testAcceptRequiresMatchingStake() public {
        uint256 duelId = _createDefaultDuel(WagrDuelEscrow.Side.Yes);

        vm.expectRevert(WagrDuelEscrow.IncorrectStake.selector);
        vm.prank(counterparty);
        escrow.acceptDuel{value: 0.5 ether}(duelId);
    }

    function testCancelOpenDuelRefundsCreator() public {
        uint256 duelId = _createDefaultDuel(WagrDuelEscrow.Side.No);
        uint256 balanceBefore = creator.balance;

        vm.prank(creator);
        escrow.cancelOpenDuel(duelId);

        WagrDuelEscrow.Duel memory duel = escrow.getDuel(duelId);
        assertEq(uint256(duel.status), uint256(WagrDuelEscrow.DuelStatus.Canceled));
        assertEq(creator.balance, balanceBefore + 1 ether);
        assertEq(address(escrow).balance, 0);
    }

    function testResolverSubmitsYesAndCreatorClaimsPot() public {
        uint256 duelId = _createAcceptedDuel(WagrDuelEscrow.Side.Yes);
        vm.warp(block.timestamp + 2 days);

        vm.prank(resolver);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, VERDICT_HASH);

        uint256 balanceBefore = creator.balance;
        vm.prank(creator);
        escrow.claimPayout(duelId);

        WagrDuelEscrow.Duel memory duel = escrow.getDuel(duelId);
        assertEq(uint256(duel.status), uint256(WagrDuelEscrow.DuelStatus.Paid));
        assertEq(creator.balance, balanceBefore + 2 ether);
        assertEq(address(escrow).balance, 0);
    }

    function testResolverSubmitsNoAndCounterpartyClaimsPot() public {
        uint256 duelId = _createAcceptedDuel(WagrDuelEscrow.Side.Yes);
        vm.warp(block.timestamp + 2 days);

        vm.prank(resolver);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.No, 8_500, VERDICT_HASH);

        uint256 balanceBefore = counterparty.balance;
        vm.prank(counterparty);
        escrow.claimPayout(duelId);

        assertEq(counterparty.balance, balanceBefore + 2 ether);
        assertEq(address(escrow).balance, 0);
    }

    function testInvalidVerdictRefundsBothSides() public {
        uint256 duelId = _createAcceptedDuel(WagrDuelEscrow.Side.Yes);
        vm.warp(block.timestamp + 2 days);

        vm.prank(resolver);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Invalid, 4_000, VERDICT_HASH);

        uint256 creatorBefore = creator.balance;
        uint256 counterpartyBefore = counterparty.balance;

        vm.prank(creator);
        escrow.claimRefund(duelId);
        vm.prank(counterparty);
        escrow.claimRefund(duelId);

        WagrDuelEscrow.Duel memory duel = escrow.getDuel(duelId);
        assertEq(uint256(duel.status), uint256(WagrDuelEscrow.DuelStatus.Paid));
        assertEq(creator.balance, creatorBefore + 1 ether);
        assertEq(counterparty.balance, counterpartyBefore + 1 ether);
        assertEq(address(escrow).balance, 0);
    }

    function testOnlyResolverCanSubmitVerdict() public {
        uint256 duelId = _createAcceptedDuel(WagrDuelEscrow.Side.Yes);
        vm.warp(block.timestamp + 2 days);

        vm.expectRevert(WagrDuelEscrow.NotResolver.selector);
        vm.prank(stranger);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, VERDICT_HASH);
    }

    function testCannotSubmitVerdictBeforeExpiry() public {
        uint256 duelId = _createAcceptedDuel(WagrDuelEscrow.Side.Yes);

        vm.expectRevert(WagrDuelEscrow.DuelNotExpired.selector);
        vm.prank(resolver);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, VERDICT_HASH);
    }

    function testCannotSubmitVerdictTwice() public {
        uint256 duelId = _createAcceptedDuel(WagrDuelEscrow.Side.Yes);
        vm.warp(block.timestamp + 2 days);

        vm.prank(resolver);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, VERDICT_HASH);

        vm.expectRevert(WagrDuelEscrow.InvalidStatus.selector);
        vm.prank(resolver);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.No, 8_500, VERDICT_HASH);
    }

    function testLoserCannotClaimPayout() public {
        uint256 duelId = _createAcceptedDuel(WagrDuelEscrow.Side.Yes);
        vm.warp(block.timestamp + 2 days);

        vm.prank(resolver);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, VERDICT_HASH);

        vm.expectRevert(WagrDuelEscrow.NotWinner.selector);
        vm.prank(counterparty);
        escrow.claimPayout(duelId);
    }

    function testWinnerCannotClaimPayoutTwice() public {
        uint256 duelId = _createAcceptedDuel(WagrDuelEscrow.Side.Yes);
        vm.warp(block.timestamp + 2 days);

        vm.prank(resolver);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Yes, 8_500, VERDICT_HASH);

        vm.prank(creator);
        escrow.claimPayout(duelId);

        vm.expectRevert(WagrDuelEscrow.InvalidStatus.selector);
        vm.prank(creator);
        escrow.claimPayout(duelId);
    }

    function testRefundCannotBeClaimedTwice() public {
        uint256 duelId = _createAcceptedDuel(WagrDuelEscrow.Side.Yes);
        vm.warp(block.timestamp + 2 days);

        vm.prank(resolver);
        escrow.submitVerdict(duelId, WagrDuelEscrow.Verdict.Invalid, 4_000, VERDICT_HASH);

        vm.prank(creator);
        escrow.claimRefund(duelId);

        vm.expectRevert(WagrDuelEscrow.AlreadyClaimed.selector);
        vm.prank(creator);
        escrow.claimRefund(duelId);
    }

    function _createDefaultDuel(WagrDuelEscrow.Side side) private returns (uint256 duelId) {
        vm.prank(creator);
        duelId = escrow.createDuel{value: 1 ether}(side, block.timestamp + 1 days, META);
    }

    function _createAcceptedDuel(WagrDuelEscrow.Side side) private returns (uint256 duelId) {
        duelId = _createDefaultDuel(side);
        vm.prank(counterparty);
        escrow.acceptDuel{value: 1 ether}(duelId);
    }

    function assertEq(uint256 actual, uint256 expected) private pure {
        require(actual == expected, "uint mismatch");
    }

    function assertEq(address actual, address expected) private pure {
        require(actual == expected, "address mismatch");
    }
}
