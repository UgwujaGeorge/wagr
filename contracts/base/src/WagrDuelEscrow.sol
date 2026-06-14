// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract WagrDuelEscrow {
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

    error NotOwner();
    error NotResolver();
    error ZeroAddress();
    error InvalidSide();
    error InvalidStake();
    error InvalidExpiry();
    error InvalidMetadata();
    error InvalidStatus();
    error IncorrectStake();
    error CreatorCannotAccept();
    error DuelExpired();
    error DuelNotExpired();
    error InvalidVerdict();
    error InvalidConfidence();
    error InvalidVerdictHash();
    error NotParticipant();
    error NotWinner();
    error AlreadyClaimed();
    error TransferFailed();
    error ReentrantCall();

    event DuelCreated(
        uint256 indexed duelId,
        address indexed creator,
        Side creatorSide,
        uint256 stakeAmount,
        uint256 expiry,
        bytes32 metadataHash
    );
    event DuelAccepted(uint256 indexed duelId, address indexed counterparty);
    event DuelCanceled(uint256 indexed duelId);
    event ResolutionRequested(uint256 indexed duelId);
    event VerdictSubmitted(uint256 indexed duelId, Verdict verdict, uint16 confidenceBps, bytes32 verdictHash);
    event PayoutClaimed(uint256 indexed duelId, address indexed winner, uint256 amount);
    event RefundClaimed(uint256 indexed duelId, address indexed user, uint256 amount);
    event ResolverUpdated(address indexed oldResolver, address indexed newResolver);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    address public owner;
    address public resolver;
    uint256 public nextDuelId = 1;

    mapping(uint256 => Duel) public duels;

    bool private locked;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyResolver() {
        if (msg.sender != resolver) revert NotResolver();
        _;
    }

    modifier nonReentrant() {
        if (locked) revert ReentrantCall();
        locked = true;
        _;
        locked = false;
    }

    constructor(address initialOwner, address initialResolver) {
        if (initialOwner == address(0) || initialResolver == address(0)) revert ZeroAddress();
        owner = initialOwner;
        resolver = initialResolver;
        emit OwnershipTransferred(address(0), initialOwner);
        emit ResolverUpdated(address(0), initialResolver);
    }

    function createDuel(Side creatorSide, uint256 expiry, bytes32 metadataHash)
        external
        payable
        returns (uint256 duelId)
    {
        if (creatorSide != Side.Yes && creatorSide != Side.No) revert InvalidSide();
        if (msg.value == 0) revert InvalidStake();
        if (expiry <= block.timestamp) revert InvalidExpiry();
        if (metadataHash == bytes32(0)) revert InvalidMetadata();

        duelId = nextDuelId++;
        duels[duelId] = Duel({
            creator: msg.sender,
            counterparty: address(0),
            creatorSide: creatorSide,
            stakeAmount: msg.value,
            expiry: expiry,
            metadataHash: metadataHash,
            status: DuelStatus.Open,
            verdict: Verdict.None,
            creatorClaimed: false,
            counterpartyClaimed: false,
            createdAt: block.timestamp,
            acceptedAt: 0,
            resolvedAt: 0
        });

        emit DuelCreated(duelId, msg.sender, creatorSide, msg.value, expiry, metadataHash);
    }

    function acceptDuel(uint256 duelId) external payable {
        Duel storage duel = duels[duelId];
        if (duel.status != DuelStatus.Open) revert InvalidStatus();
        if (msg.sender == duel.creator) revert CreatorCannotAccept();
        if (block.timestamp >= duel.expiry) revert DuelExpired();
        if (msg.value != duel.stakeAmount) revert IncorrectStake();

        duel.counterparty = msg.sender;
        duel.status = DuelStatus.Active;
        duel.acceptedAt = block.timestamp;

        emit DuelAccepted(duelId, msg.sender);
    }

    function cancelOpenDuel(uint256 duelId) external nonReentrant {
        Duel storage duel = duels[duelId];
        if (duel.status != DuelStatus.Open) revert InvalidStatus();
        if (msg.sender != duel.creator) revert NotParticipant();

        uint256 amount = duel.stakeAmount;
        duel.status = DuelStatus.Canceled;
        duel.creatorClaimed = true;

        emit DuelCanceled(duelId);
        _sendETH(msg.sender, amount);
    }

    function markResolutionRequested(uint256 duelId) external {
        Duel storage duel = duels[duelId];
        if (duel.status != DuelStatus.Active) revert InvalidStatus();
        if (block.timestamp < duel.expiry) revert DuelNotExpired();

        duel.status = DuelStatus.ResolutionRequested;
        emit ResolutionRequested(duelId);
    }

    function submitVerdict(uint256 duelId, Verdict verdict, uint16 confidenceBps, bytes32 verdictHash)
        external
        onlyResolver
    {
        Duel storage duel = duels[duelId];
        if (duel.status != DuelStatus.Active && duel.status != DuelStatus.ResolutionRequested) revert InvalidStatus();
        if (block.timestamp < duel.expiry) revert DuelNotExpired();
        if (verdict != Verdict.Yes && verdict != Verdict.No && verdict != Verdict.Invalid) revert InvalidVerdict();
        if (confidenceBps > 10_000) revert InvalidConfidence();
        if (verdictHash == bytes32(0)) revert InvalidVerdictHash();

        duel.verdict = verdict;
        duel.resolvedAt = block.timestamp;
        duel.status = verdict == Verdict.Invalid ? DuelStatus.Invalid : DuelStatus.Resolved;

        emit VerdictSubmitted(duelId, verdict, confidenceBps, verdictHash);
    }

    function claimPayout(uint256 duelId) external nonReentrant {
        Duel storage duel = duels[duelId];
        if (duel.status != DuelStatus.Resolved) revert InvalidStatus();
        if (!_isParticipant(duel, msg.sender)) revert NotParticipant();
        if (!_isWinner(duel, msg.sender)) revert NotWinner();
        if (duel.creatorClaimed || duel.counterpartyClaimed) revert AlreadyClaimed();

        uint256 amount = duel.stakeAmount * 2;
        duel.creatorClaimed = true;
        duel.counterpartyClaimed = true;
        duel.status = DuelStatus.Paid;

        emit PayoutClaimed(duelId, msg.sender, amount);
        _sendETH(msg.sender, amount);
    }

    function claimRefund(uint256 duelId) external nonReentrant {
        Duel storage duel = duels[duelId];
        if (duel.status != DuelStatus.Invalid) revert InvalidStatus();

        if (msg.sender == duel.creator) {
            if (duel.creatorClaimed) revert AlreadyClaimed();
            duel.creatorClaimed = true;
        } else if (msg.sender == duel.counterparty) {
            if (duel.counterpartyClaimed) revert AlreadyClaimed();
            duel.counterpartyClaimed = true;
        } else {
            revert NotParticipant();
        }

        if (duel.creatorClaimed && duel.counterpartyClaimed) {
            duel.status = DuelStatus.Paid;
        }

        emit RefundClaimed(duelId, msg.sender, duel.stakeAmount);
        _sendETH(msg.sender, duel.stakeAmount);
    }

    function updateResolver(address newResolver) external onlyOwner {
        if (newResolver == address(0)) revert ZeroAddress();
        address oldResolver = resolver;
        resolver = newResolver;
        emit ResolverUpdated(oldResolver, newResolver);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function getDuel(uint256 duelId) external view returns (Duel memory) {
        return duels[duelId];
    }

    function counterpartySide(uint256 duelId) external view returns (Side) {
        Duel storage duel = duels[duelId];
        if (duel.creatorSide == Side.Yes) return Side.No;
        if (duel.creatorSide == Side.No) return Side.Yes;
        return Side.None;
    }

    function winnerOf(uint256 duelId) external view returns (address) {
        Duel storage duel = duels[duelId];
        if (duel.status != DuelStatus.Resolved) return address(0);
        return _isWinner(duel, duel.creator) ? duel.creator : duel.counterparty;
    }

    function _isParticipant(Duel storage duel, address user) private view returns (bool) {
        return user == duel.creator || user == duel.counterparty;
    }

    function _isWinner(Duel storage duel, address user) private view returns (bool) {
        Side userSide = user == duel.creator ? duel.creatorSide : _opposite(duel.creatorSide);
        return (duel.verdict == Verdict.Yes && userSide == Side.Yes) || (duel.verdict == Verdict.No && userSide == Side.No);
    }

    function _opposite(Side side) private pure returns (Side) {
        if (side == Side.Yes) return Side.No;
        if (side == Side.No) return Side.Yes;
        return Side.None;
    }

    function _sendETH(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}

