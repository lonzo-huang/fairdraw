// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title FairDrawEscrow
 * @notice Locks organizer-funded prize pools in the configured stablecoin.
 *
 * Model (organizer-funded, adapted from the FairDraw whitepaper):
 *   1. The organizer calls `fund`, depositing pool + platform fee in one tx.
 *      The fee is forwarded to `feeRecipient` immediately; the pool is locked.
 *   2. After the off-chain draw finalises, the oracle calls `resolve`,
 *      committing each winner's share (index = position in the draw's
 *      winners array). Resolution is one-way and mutually exclusive with
 *      refunding.
 *   3. The winner submits a payout address to the app; the oracle calls
 *      `pay(id, idx, to)` and the contract sends exactly the committed share.
 *      Each share can be paid once — the oracle cannot pay more, twice, or
 *      touch other campaigns.
 *   4. If the campaign is cancelled/expires unresolved, `refund` returns the
 *      full pool to the recorded funder once `cancelAfter` passes.
 *
 * Trust boundaries: the oracle can redirect unpaid shares to an arbitrary
 * address (bounded, publicly auditable theft surface — it cannot exceed the
 * pool or pay the same share twice). The owner can only rotate oracle /
 * feeRecipient and rescue foreign tokens — it can never touch pool USDT.
 */
contract FairDrawEscrow {
    IERC20 public immutable token;
    address public oracle;
    address public owner;
    address public feeRecipient;

    struct Campaign {
        address funder;
        uint256 pool;        // remaining locked amount (decreases on pay)
        uint64 cancelAfter;  // refund allowed at/after this timestamp
        bool resolved;       // resolved OR refunded — terminal for both paths
    }

    mapping(bytes32 => Campaign) public campaigns;
    mapping(bytes32 => mapping(uint256 => uint256)) public winnerShares;
    mapping(bytes32 => mapping(uint256 => bool)) public paid;
    uint256 private locked;

    event Deposited(bytes32 indexed id, address indexed funder, uint256 pool, uint256 fee, uint64 cancelAfter);
    event Resolved(bytes32 indexed id, uint256 count);
    event Paid(bytes32 indexed id, uint256 indexed idx, address indexed to, uint256 amount);
    event Refunded(bytes32 indexed id, address indexed funder, uint256 amount);
    event RemainderSwept(bytes32 indexed id, address indexed funder, uint256 amount);
    event OracleUpdated(address oracle);
    event FeeRecipientUpdated(address feeRecipient);

    error NotOwner();
    error NotOracle();
    error ZeroAddress();
    error CampaignExists();
    error UnknownCampaign();
    error AlreadyResolved();
    error NotResolved();
    error TooEarly();
    error BadAmount();
    error PoolExceeded();
    error EmptyShares();
    error AlreadyPaid();
    error UnpaidRemainder();
    error PoolToken();
    error Reentrant();
    error TransferFailed();

    modifier onlyOracle() {
        if (msg.sender != oracle) revert NotOracle();
        _;
    }
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
    modifier nonReentrant() {
        if (locked == 1) revert Reentrant();
        locked = 1;
        _;
        locked = 0;
    }

    constructor(address _token, address _oracle, address _feeRecipient) {
        if (_token == address(0) || _oracle == address(0) || _feeRecipient == address(0)) revert ZeroAddress();
        token = IERC20(_token);
        oracle = _oracle;
        feeRecipient = _feeRecipient;
        owner = msg.sender;
    }

    /**
     * @notice Locks `pool` and forwards `fee` to the platform wallet. The
     * caller must first `approve` this contract for pool + fee. `cancelAfter`
     * is the unix timestamp (usually the campaign deadline) after which the
     * funder may reclaim an unresolved pool.
     */
    function fund(bytes32 id, uint256 pool, uint256 fee, uint64 cancelAfter) external nonReentrant {
        if (campaigns[id].funder != address(0)) revert CampaignExists();
        if (pool == 0) revert BadAmount();
        campaigns[id] = Campaign({
            funder: msg.sender,
            pool: pool,
            cancelAfter: cancelAfter,
            resolved: false
        });
        if (!token.transferFrom(msg.sender, address(this), pool + fee)) revert TransferFailed();
        if (fee > 0 && !token.transfer(feeRecipient, fee)) revert TransferFailed();
        emit Deposited(id, msg.sender, pool, fee, cancelAfter);
    }

    /**
     * @notice Commits the winner shares for a funded campaign. `shares[i]` is
     * the payout for draw winners[i]. One-way: after this, refund is closed.
     */
    function resolve(bytes32 id, uint256[] calldata shares) external onlyOracle {
        Campaign storage camp = campaigns[id];
        if (camp.funder == address(0)) revert UnknownCampaign();
        if (camp.resolved) revert AlreadyResolved();
        if (shares.length == 0) revert EmptyShares();
        uint256 total;
        for (uint256 i = 0; i < shares.length; i++) {
            if (shares[i] == 0) revert BadAmount();
            winnerShares[id][i] = shares[i];
            total += shares[i];
        }
        if (total > camp.pool) revert PoolExceeded();
        camp.resolved = true;
        emit Resolved(id, shares.length);
    }

    /**
     * @notice Sends winner `idx`'s committed share to `to` — the address the
     * winner submitted in the app. Effects before interaction; the share is
     * consumed before the transfer so it can never be paid twice.
     */
    function pay(bytes32 id, uint256 idx, address to) external onlyOracle nonReentrant {
        Campaign storage camp = campaigns[id];
        if (!camp.resolved) revert NotResolved();
        if (to == address(0)) revert ZeroAddress();
        uint256 share = winnerShares[id][idx];
        if (share == 0 || paid[id][idx]) revert AlreadyPaid();
        paid[id][idx] = true;
        winnerShares[id][idx] = 0;
        camp.pool -= share;
        if (!token.transfer(to, share)) revert TransferFailed();
        emit Paid(id, idx, to, share);
    }

    /**
     * @notice Returns the full pool to the funder once `cancelAfter` passes
     * and the campaign was never resolved. Permissionless — the funds can
     * only go to the recorded funder.
     */
    function refund(bytes32 id) external nonReentrant {
        Campaign storage camp = campaigns[id];
        if (camp.funder == address(0)) revert UnknownCampaign();
        if (camp.resolved) revert AlreadyResolved();
        if (block.timestamp < camp.cancelAfter) revert TooEarly();
        address funder = camp.funder;
        uint256 amount = camp.pool;
        camp.resolved = true;
        camp.pool = 0;
        if (!token.transfer(funder, amount)) revert TransferFailed();
        emit Refunded(id, funder, amount);
    }

    /**
     * @notice Sends rounding dust to the funder after every share was paid.
     */
    function sweepRemainder(bytes32 id, uint256 count) external {
        Campaign storage camp = campaigns[id];
        if (!camp.resolved || camp.funder == address(0)) revert NotResolved();
        for (uint256 i = 0; i < count; i++) {
            if (!paid[id][i]) revert UnpaidRemainder();
        }
        uint256 amount = camp.pool;
        if (amount == 0) revert BadAmount();
        camp.pool = 0;
        if (!token.transfer(camp.funder, amount)) revert TransferFailed();
        emit RemainderSwept(id, camp.funder, amount);
    }

    function setOracle(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        oracle = next;
        emit OracleUpdated(next);
    }

    function setFeeRecipient(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        feeRecipient = next;
        emit FeeRecipientUpdated(next);
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        owner = next;
    }

    /** Rescues tokens sent here by mistake. The pool token is never rescuable. */
    function rescueToken(address t, address to, uint256 amount) external onlyOwner {
        if (t == address(token)) revert PoolToken();
        if (to == address(0)) revert ZeroAddress();
        if (!IERC20(t).transfer(to, amount)) revert TransferFailed();
    }
}
