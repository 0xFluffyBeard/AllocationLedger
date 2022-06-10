//SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;

import "./PausableActions.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @dev This contract can be used to keep a ledger of deposits.
 *      Users can deposit an ERC20 token into the contract.
 *      The owner can withdraw the deposited funds.
 *      The contract will keep the ledger of the ammounts deposited by the users.
 *      The contract can calculate the percentage of deposits for each user.
 */
contract AllocationLedger is
    ReentrancyGuard,
    Context,
    Ownable,
    PausableActions
{
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant PRECISION = 10**6;

    bytes32 public constant PAUSE_ACTION_DEPOSIT =
        keccak256("PAUSE_ACTION_DEPOSIT");
    bytes32 public constant PAUSE_ACTION_CLAIM =
        keccak256("PAUSE_ACTION_CLAIM");

    // Address of the token used for deposits.
    IERC20 public depositToken;
    // Address of the reward token
    IERC20 public rewardsToken;
    // Optional overall deposit limit. Disabled if 0.
    uint256 public depositMax = 0;
    // Optional max amount a single user can deposit. Disabled if 0.
    uint256 public depositUserMax = 0;
    // Optional min amount a single user should deposit. Disabled if 0.
    uint256 public depositUserMin = 0;
    // Number of addresses in the whitelist. Used to check if the whitelist is enable.
    uint256 public whitelistLength = 0;

    // Total sum of all deposits.
    uint256 public totalDeposits = 0;
    // Total amount of rewards deposited.
    uint256 public totalRewardsDeposited;
    // Total amount of rewards claimed.
    uint256 public totalRewardsClaimed;

    // List of all users who diposited tokens.
    address[] public accounts;

    // Mapping of all user deposits.
    mapping(address => uint256) public deposits;

    // Mapping of all user claims.
    mapping(address => uint256) public claims;

    // Mapping with addresses, who can deposit.
    mapping(address => bool) public whitelisted;

    // Emited when an address is added to the whitelist.
    event WhitelistEntryAdded(address indexed account);
    // Emited when an address is removed from the whitelist.
    event WhitelistEntryRemoved(address indexed account);
    // Emited when a user depoasits funds.
    event DepositAdded(
        address indexed account,
        uint256 amount,
        uint256 oldDeposit,
        uint256 newDeposit
    );
    // Emited when the owner withdraws the deposited funds.
    event Withdrawn(address indexed account, uint256 amount);
    // Emited when the owner deposits the reward tokens.
    event RewardsDeposited(address indexed account, uint256 amount);
    // Emited when the user claims rewards.
    event RewardsClaimed(
        address indexed account,
        uint256 amount,
        uint256 oldAmount
    );

    /**
     * @dev Reverts the transaction if the `account` is not whitelist while the whitelist is enabled.
     */
    modifier onlyWhitelisted(address account) {
        require(
            whitelistLength == 0 || whitelisted[account],
            "Account not whitelisted"
        );
        _;
    }

    /**
     * @dev Constructor with the default values.
     * @param depositToken_ Address of the ERC20 token contract that will be deposited to this contract.
     * @param depositMax_ Maximumn amount of tokens that can be deposited to this contract. Will be disabled if equal 0.
     * @param depositUserMax_ Maximum amount a single account can deposit to this contract. Will be disabled if equal 0.
     * @param whitelist_ List of addresses to add to the whitelist. If the array is empty, the whitelist will be disabled.
     */
    constructor(
        IERC20 depositToken_,
        uint256 depositMax_,
        uint256 depositUserMax_,
        uint256 depositUserMin_,
        address[] memory whitelist_,
        IERC20 rewardsToken_
    ) {
        depositToken = depositToken_;
        rewardsToken = rewardsToken_;

        setLimits(depositMax_, depositUserMax_, depositUserMin_);
        addToWhitelist(whitelist_);

        _pause(PAUSE_ACTION_CLAIM);
    }

    /**
     * @dev Transfers the `depositAmount` from the caller to this contract.
     *      Prior calling this function, user must give this contract an allowance >= `depositAmount`.
     */
    function deposit(uint256 depositAmount)
        external
        nonReentrant
        whenNotPausedAction(PAUSE_ACTION_DEPOSIT)
        onlyWhitelisted(_msgSender())
    {
        uint256 _oldDeposit = deposits[_msgSender()];
        uint256 _newDeposit = _oldDeposit.add(depositAmount);
        uint256 _newTotalDeposits = totalDeposits.add(depositAmount);

        require(
            depositMax == 0 || _newTotalDeposits < depositMax,
            "Global deposit limit exceded"
        );
        require(
            depositUserMax == 0 || _newDeposit <= depositUserMax,
            "User max deposit limit exceded"
        );
        require(
            depositUserMin == 0 || _newDeposit >= depositUserMin,
            "User min deposit not reached"
        );

        depositToken.safeTransferFrom(
            _msgSender(),
            address(this),
            depositAmount
        );

        if (_oldDeposit == 0) {
            accounts.push(_msgSender());
        }

        deposits[_msgSender()] = _newDeposit;
        totalDeposits = _newTotalDeposits;

        emit DepositAdded(
            _msgSender(),
            depositAmount,
            _oldDeposit,
            _newDeposit
        );
    }

    /**
     * @dev Used to claim available rewards to the `_msgSender()` address.
     */
    function claimRewards()
        external
        whenPausedAction(PAUSE_ACTION_DEPOSIT)
        whenNotPausedAction(PAUSE_ACTION_CLAIM)
        onlyWhitelisted(_msgSender())
    {
        require(deposits[_msgSender()] > 0, "Account never deposited");

        uint256 accountShare = getAccountRewards(_msgSender());
        uint256 alreadyClaimed = claims[_msgSender()];
        uint256 amount = accountShare - alreadyClaimed;

        require(amount > 0, "Nothing to claim");

        rewardsToken.transfer(_msgSender(), amount);
        claims[_msgSender()] = alreadyClaimed.add(amount);
        totalRewardsClaimed += amount;
        emit RewardsClaimed(_msgSender(), amount, alreadyClaimed);
    }

    /**
     * @dev Used by the owner to withdraw all deposited funds to the `_msgSender()` address.
     */
    function withdrawDeposits(uint256 amount, bool pauseDeposits_)
        external
        nonReentrant
        onlyOwner
    {
        depositToken.safeTransfer(_msgSender(), amount);

        emit Withdrawn(_msgSender(), amount);

        if (pauseDeposits_) {
            _pause(PAUSE_ACTION_DEPOSIT);
        }
    }

    /**
     * @dev Used by the owner to deposit the rewards tokens.
     */
    function depositRewards(uint256 amount) external onlyOwner {
        require(address(rewardsToken) != address(0), "Rewards token not set");
        require(totalDeposits > 0, "No deposits");

        rewardsToken.transferFrom(_msgSender(), address(this), amount);
        totalRewardsDeposited += amount;
    }

    /**
     * @dev Used by the owner to withdraw rest of the rewards.
     */
    function withdrawRewards(uint256 amount) external onlyOwner {
        uint256 availableRewards = totalRewardsDeposited - totalRewardsClaimed;
        require(availableRewards >= amount, "Not enough rewards");

        rewardsToken.safeTransfer(_msgSender(), amount);

        totalRewardsDeposited -= amount;
    }

    /**
     * @dev Returns the account's share of the total deposits in percent.
     * @notice To get the percentage, the return value must be devided by PRECISION (10 ** 6).
     */
    function getAccountShare(address account) public view returns (uint256) {
        return deposits[account].mul(100).mul(PRECISION).div(totalDeposits);
    }

    /**
     * @dev Returns the account's share of the total rewards in wei.
     */
    function getAccountRewards(address account) public view returns (uint256) {
        if (totalRewardsDeposited == 0) {
            return 0;
        }

        uint256 accountShare = getAccountShare(account);

        if (accountShare == 0) {
            return 0;
        }

        return totalRewardsDeposited.mul(accountShare).div(PRECISION).div(100);
    }

    /**
     * @dev Set the deposit limits.
     */
    function setLimits(
        uint256 depositMax_,
        uint256 depositUserMax_,
        uint256 depositUserMin_
    ) public onlyOwner {
        depositMax = depositMax_;
        depositUserMax = depositUserMax_;
        depositUserMin = depositUserMin_;
    }

    /**
     * @dev Set the rewards token address if not deposited before.
     *
     * Requirements:
     *
     * - No rewards must be deposited
     */
    function setRewardsToken(IERC20 rewardsToken_) external onlyOwner {
        require(totalRewardsDeposited == 0, "Already deposited");
        rewardsToken = rewardsToken_;
    }

    /**
     * @dev Adds a list of accounts to the whitelist.
     */
    function addToWhitelist(address[] memory accounts_) public onlyOwner {
        for (uint256 index = 0; index < accounts_.length; index++) {
            whitelisted[accounts_[index]] = true;
            emit WhitelistEntryAdded(accounts_[index]);
        }

        whitelistLength += accounts_.length;
    }

    /**
     * @dev Removes a list of accounts from the whitelist.
     */
    function removeFromWhitelist(address[] memory accounts_) public onlyOwner {
        for (uint256 index = 0; index < accounts_.length; index++) {
            whitelisted[accounts_[index]] = false;
            emit WhitelistEntryRemoved(accounts_[index]);
        }

        whitelistLength -= accounts_.length;
    }

    /**
     * @dev External function to pause the default action.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev External function to pause an action.
     */
    function pauseAction(bytes32 action) external onlyOwner {
        _pause(action);
    }

    /**
     * @dev External function to pause the deposits.
     */
    function pauseDeposit() external onlyOwner {
        _pause(PAUSE_ACTION_DEPOSIT);
    }

    /**
     * @dev External function to pause the claiming.
     */
    function pauseClaim() external onlyOwner {
        _pause(PAUSE_ACTION_CLAIM);
    }

    /**
     * @dev External function to unpause the default action.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev External function to unpause an action.
     */
    function unpauseAction(bytes32 action) external onlyOwner {
        _unpause(action);
    }

    /**
     * @dev External function to unpause the deposits.
     */
    function unpauseDeposit() external onlyOwner {
        _unpause(PAUSE_ACTION_DEPOSIT);
    }

    /**
     * @dev External function to unpause the claiming.
     */
    function unpauseClaim() external onlyOwner {
        _unpause(PAUSE_ACTION_CLAIM);
    }

    /**
     * @dev Revert the transaction if the owner tries to renounce the ownership.
     *      If this would happen, all funds would be trapped in this contract.
     */
    function renounceOwnership() public virtual override onlyOwner {
        revert("Renounce not allowed");
    }
}
