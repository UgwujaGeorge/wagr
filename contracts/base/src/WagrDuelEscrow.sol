// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WagrDuelEscrow
/// @notice Escrow and settlement layer for Wagr 1v1 prediction duels.
///
/// A verdict is only accepted when it carries an EIP-712 attestation quorum
/// over the exact duel state this contract already holds. The escrow never
/// trusts a single relayer key: the relayer is transport, the attesters are
/// authorization, and both participants retain a challenge path.
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
        Paid,
        VerdictProposed,
        Challenged
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
        uint256 verdictProposedAt;
        bytes32 verdictHash;
        bytes32 genlayerTxHash;
        uint16 confidenceBps;
    }

    error NotOwner();
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
    error InvalidGenLayerTxHash();
    error MetadataHashMismatch();
    error DuelStateHashMismatch();
    error NotParticipant();
    error NotWinner();
    error AlreadyClaimed();
    error TransferFailed();
    error ReentrantCall();
    error InvalidAttesterSet();
    error InvalidThreshold();
    error DuplicateAttester();
    error NotAnAttester();
    error InsufficientAttestations();
    error UnorderedSignatures();
    error InvalidSignature();
    error ChallengeWindowOpen();
    error ChallengeWindowClosed();
    error InvalidWindow();
    error GracePeriodNotElapsed();

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
    event VerdictProposed(
        uint256 indexed duelId,
        Verdict verdict,
        uint16 confidenceBps,
        bytes32 metadataHash,
        bytes32 verdictHash,
        bytes32 genlayerTxHash,
        uint256 attestationCount
    );
    event VerdictChallenged(uint256 indexed duelId, address indexed challenger);
    event VerdictSubmitted(
        uint256 indexed duelId,
        Verdict verdict,
        uint16 confidenceBps,
        bytes32 metadataHash,
        bytes32 verdictHash,
        bytes32 genlayerTxHash
    );
    event ResolutionTimedOut(uint256 indexed duelId);
    event PayoutClaimed(uint256 indexed duelId, address indexed winner, uint256 amount);
    event RefundClaimed(uint256 indexed duelId, address indexed user, uint256 amount);
    event AttesterAdded(address indexed attester);
    event AttesterRemoved(address indexed attester);
    event ThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event ChallengeWindowUpdated(uint256 oldWindow, uint256 newWindow);
    event ResolutionGracePeriodUpdated(uint256 oldPeriod, uint256 newPeriod);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant VERDICT_TYPEHASH = keccak256(
        "Verdict(uint256 duelId,uint8 verdict,uint16 confidenceBps,bytes32 metadataHash,bytes32 authenticatedDuelDataHash,bytes32 verdictHash,bytes32 genlayerTxHash)"
    );
    bytes32 private constant DOMAIN_NAME_HASH = keccak256("Wagr");
    bytes32 private constant DOMAIN_VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1_HALF_N =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    uint256 public constant MIN_CHALLENGE_WINDOW = 5 minutes;
    uint256 public constant MAX_CHALLENGE_WINDOW = 7 days;
    uint256 public constant MIN_RESOLUTION_GRACE_PERIOD = 1 hours;
    uint256 public constant MAX_RESOLUTION_GRACE_PERIOD = 90 days;

    address public owner;
    uint256 public nextDuelId = 1;
    /// @notice Attestations required to propose a verdict.
    uint256 public threshold;
    /// @notice Seconds a proposed verdict stays challengeable by either participant.
    uint256 public challengeWindow;
    /// @notice Seconds after expiry before an unresolved duel becomes refundable.
    uint256 public resolutionGracePeriod;

    address[] private attesterList;
    mapping(address => bool) public isAttester;
    mapping(uint256 => Duel) public duels;

    bool private locked;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (locked) revert ReentrantCall();
        locked = true;
        _;
        locked = false;
    }

    constructor(
        address initialOwner,
        address[] memory initialAttesters,
        uint256 initialThreshold,
        uint256 initialChallengeWindow,
        uint256 initialResolutionGracePeriod
    ) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);

        for (uint256 i = 0; i < initialAttesters.length; i++) {
            _addAttester(initialAttesters[i]);
        }
        _setThreshold(initialThreshold);
        _setChallengeWindow(initialChallengeWindow);
        _setResolutionGracePeriod(initialResolutionGracePeriod);
    }

    // ---------------------------------------------------------------- duels

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
        Duel storage duel = duels[duelId];
        duel.creator = msg.sender;
        duel.creatorSide = creatorSide;
        duel.stakeAmount = msg.value;
        duel.expiry = expiry;
        duel.metadataHash = metadataHash;
        duel.status = DuelStatus.Open;
        duel.createdAt = block.timestamp;

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

    // ---------------------------------------------------------- attestation

    /// @notice Binding hash of the duel state, recomputed from this contract's
    /// own storage. Attesters sign over this value, so an attestation can never
    /// describe a duel state the escrow does not actually hold.
    function duelStateHash(uint256 duelId) public view returns (bytes32) {
        Duel storage duel = duels[duelId];
        return keccak256(
            abi.encode(
                block.chainid,
                address(this),
                duelId,
                duel.creator,
                duel.counterparty,
                uint8(duel.creatorSide),
                duel.stakeAmount,
                duel.expiry,
                duel.metadataHash
            )
        );
    }

    function verdictDigest(
        uint256 duelId,
        Verdict verdict,
        uint16 confidenceBps,
        bytes32 metadataHash,
        bytes32 verdictHash,
        bytes32 genlayerTxHash
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                VERDICT_TYPEHASH,
                duelId,
                uint8(verdict),
                confidenceBps,
                metadataHash,
                duelStateHash(duelId),
                verdictHash,
                genlayerTxHash
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, DOMAIN_NAME_HASH, DOMAIN_VERSION_HASH, block.chainid, address(this))
        );
    }

    /// @notice Propose a GenLayer verdict backed by an attestation quorum.
    /// @dev Signatures must be ordered by ascending signer address. From
    /// `ResolutionRequested` the standard `threshold` applies; from
    /// `Challenged` every attester must sign.
    function submitVerdict(
        uint256 duelId,
        Verdict verdict,
        uint16 confidenceBps,
        bytes32 metadataHash,
        bytes32 verdictHash,
        bytes32 genlayerTxHash,
        bytes[] calldata signatures
    ) external {
        Duel storage duel = duels[duelId];
        bool escalated = duel.status == DuelStatus.Challenged;
        if (duel.status != DuelStatus.ResolutionRequested && !escalated) revert InvalidStatus();
        if (block.timestamp < duel.expiry) revert DuelNotExpired();
        if (verdict != Verdict.Yes && verdict != Verdict.No && verdict != Verdict.Invalid) revert InvalidVerdict();
        if (confidenceBps > 10_000) revert InvalidConfidence();
        if (metadataHash != duel.metadataHash) revert MetadataHashMismatch();
        if (verdictHash == bytes32(0)) revert InvalidVerdictHash();
        if (genlayerTxHash == bytes32(0)) revert InvalidGenLayerTxHash();

        uint256 required = escalated ? attesterList.length : threshold;
        bytes32 digest = verdictDigest(duelId, verdict, confidenceBps, metadataHash, verdictHash, genlayerTxHash);
        _requireQuorum(digest, signatures, required);

        duel.verdict = verdict;
        duel.confidenceBps = confidenceBps;
        duel.verdictHash = verdictHash;
        duel.genlayerTxHash = genlayerTxHash;

        if (escalated) {
            // An escalated verdict carries every attester and is final on arrival.
            _finalize(duel, duelId);
        } else {
            duel.status = DuelStatus.VerdictProposed;
            duel.verdictProposedAt = block.timestamp;
            emit VerdictProposed(
                duelId, verdict, confidenceBps, metadataHash, verdictHash, genlayerTxHash, signatures.length
            );
        }
    }

    /// @notice Either participant may challenge a proposed verdict, which
    /// raises the bar to a unanimous attestation instead of overturning it.
    function challengeVerdict(uint256 duelId) external {
        Duel storage duel = duels[duelId];
        if (duel.status != DuelStatus.VerdictProposed) revert InvalidStatus();
        if (!_isParticipant(duel, msg.sender)) revert NotParticipant();
        if (block.timestamp > duel.verdictProposedAt + challengeWindow) revert ChallengeWindowClosed();

        duel.status = DuelStatus.Challenged;
        duel.verdictProposedAt = block.timestamp;
        emit VerdictChallenged(duelId, msg.sender);
    }

    /// @notice Finalize an unchallenged verdict once the window has elapsed.
    function finalizeVerdict(uint256 duelId) external {
        Duel storage duel = duels[duelId];
        if (duel.status != DuelStatus.VerdictProposed) revert InvalidStatus();
        if (block.timestamp <= duel.verdictProposedAt + challengeWindow) revert ChallengeWindowOpen();
        _finalize(duel, duelId);
    }

    /// @notice A challenge the attesters never answered unanimously settles as
    /// INVALID, so both participants recover their stake.
    function finalizeChallenge(uint256 duelId) external {
        Duel storage duel = duels[duelId];
        if (duel.status != DuelStatus.Challenged) revert InvalidStatus();
        if (block.timestamp <= duel.verdictProposedAt + challengeWindow) revert ChallengeWindowOpen();

        duel.verdict = Verdict.Invalid;
        duel.status = DuelStatus.Invalid;
        duel.resolvedAt = block.timestamp;
        emit VerdictSubmitted(
            duelId, Verdict.Invalid, duel.confidenceBps, duel.metadataHash, duel.verdictHash, duel.genlayerTxHash
        );
    }

    /// @notice Rescue path when no verdict ever arrives. Without this, an
    /// offline relayer or attester set would strand both stakes permanently.
    function markResolutionTimedOut(uint256 duelId) external {
        Duel storage duel = duels[duelId];
        if (duel.status != DuelStatus.Active && duel.status != DuelStatus.ResolutionRequested) revert InvalidStatus();
        if (block.timestamp < duel.expiry + resolutionGracePeriod) revert GracePeriodNotElapsed();

        duel.verdict = Verdict.Invalid;
        duel.status = DuelStatus.Invalid;
        duel.resolvedAt = block.timestamp;
        emit ResolutionTimedOut(duelId);
    }

    // -------------------------------------------------------------- payouts

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

    // ---------------------------------------------------------------- admin

    function addAttester(address attester) external onlyOwner {
        _addAttester(attester);
    }

    function removeAttester(address attester) external onlyOwner {
        if (!isAttester[attester]) revert NotAnAttester();
        isAttester[attester] = false;
        uint256 length = attesterList.length;
        for (uint256 i = 0; i < length; i++) {
            if (attesterList[i] == attester) {
                attesterList[i] = attesterList[length - 1];
                attesterList.pop();
                break;
            }
        }
        if (threshold > attesterList.length) revert InvalidThreshold();
        emit AttesterRemoved(attester);
    }

    function setThreshold(uint256 newThreshold) external onlyOwner {
        _setThreshold(newThreshold);
    }

    function setChallengeWindow(uint256 newWindow) external onlyOwner {
        _setChallengeWindow(newWindow);
    }

    function setResolutionGracePeriod(uint256 newPeriod) external onlyOwner {
        _setResolutionGracePeriod(newPeriod);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    // ----------------------------------------------------------------- view

    function getDuel(uint256 duelId) external view returns (Duel memory) {
        return duels[duelId];
    }

    function attesters() external view returns (address[] memory) {
        return attesterList;
    }

    function attesterCount() external view returns (uint256) {
        return attesterList.length;
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

    // -------------------------------------------------------------- private

    function _finalize(Duel storage duel, uint256 duelId) private {
        duel.resolvedAt = block.timestamp;
        duel.status = duel.verdict == Verdict.Invalid ? DuelStatus.Invalid : DuelStatus.Resolved;
        emit VerdictSubmitted(
            duelId, duel.verdict, duel.confidenceBps, duel.metadataHash, duel.verdictHash, duel.genlayerTxHash
        );
    }

    function _requireQuorum(bytes32 digest, bytes[] calldata signatures, uint256 required) private view {
        if (required == 0) revert InvalidThreshold();
        if (signatures.length < required) revert InsufficientAttestations();

        address previous = address(0);
        uint256 valid = 0;
        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = _recoverSigner(digest, signatures[i]);
            // Strictly ascending order makes duplicate signers unrepresentable.
            if (signer <= previous) revert UnorderedSignatures();
            if (!isAttester[signer]) revert NotAnAttester();
            previous = signer;
            valid++;
        }
        if (valid < required) revert InsufficientAttestations();
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidSignature();
        // Reject the malleable upper-range s so one attestation has one encoding.
        if (uint256(s) > SECP256K1_HALF_N) revert InvalidSignature();

        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }

    function _addAttester(address attester) private {
        if (attester == address(0)) revert ZeroAddress();
        if (isAttester[attester]) revert DuplicateAttester();
        isAttester[attester] = true;
        attesterList.push(attester);
        emit AttesterAdded(attester);
    }

    function _setThreshold(uint256 newThreshold) private {
        if (newThreshold == 0 || newThreshold > attesterList.length) revert InvalidThreshold();
        uint256 oldThreshold = threshold;
        threshold = newThreshold;
        emit ThresholdUpdated(oldThreshold, newThreshold);
    }

    function _setChallengeWindow(uint256 newWindow) private {
        if (newWindow < MIN_CHALLENGE_WINDOW || newWindow > MAX_CHALLENGE_WINDOW) revert InvalidWindow();
        uint256 oldWindow = challengeWindow;
        challengeWindow = newWindow;
        emit ChallengeWindowUpdated(oldWindow, newWindow);
    }

    function _setResolutionGracePeriod(uint256 newPeriod) private {
        if (newPeriod < MIN_RESOLUTION_GRACE_PERIOD || newPeriod > MAX_RESOLUTION_GRACE_PERIOD) revert InvalidWindow();
        uint256 oldPeriod = resolutionGracePeriod;
        resolutionGracePeriod = newPeriod;
        emit ResolutionGracePeriodUpdated(oldPeriod, newPeriod);
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
