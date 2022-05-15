//SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.5;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";

/**
 * @dev This contract can be used to keep a ledger of deposits.
 *      Users can deposit an ERC20 token into the contract.
 *      The owner can withdraw the deposited funds.
 *      The contract will keep the ledger of the ammounts deposited by the users.
 *      The contract can calculate the percentage of deposits for each user.
 */
contract AllocationLedger is ReentrancyGuard, Context, Ownable, Pausable {
    using SafeMath for uint256;

    // Address of the token used for deposits.
    address public token;
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

    // List of all users who diposited tokens.
    address[] public accounts;
    // Mapping of all user deposits.
    mapping(address => uint256) public deposits;

    // Mapping with addresses, who can deposit.
    mapping(address => bool) public whitelist;

    // Emited then an address is added to the whitelist
    event WhitelistEntryAdded(address indexed account);
    // Emited then an address is removed from the whitelist
    event WhitelistEntryRemoved(address indexed account);
    // Emited then an address is added to the whitelist
    event DepositAdded(
        address indexed account,
        uint256 amount,
        uint256 oldDeposit,
        uint256 newDeposit
    );
    // Emited when the owner withdraws the deposited funds
    event Withdrawn(address indexed account);

    /**
     * @dev Reverts the transaction if the `account` is not whitelist while the whitelist is enabled.
     */
    modifier onlyWhitelisted(address account) {
        require(
            whitelistLength == 0 || isWhitelisted(account),
            "Account not whitelisted"
        );
        _;
    }

    /**
     * @dev Constructor with the default values.
     * @param token_ Address of the ERC20 token contract that will be deposited to this contract.
     * @param depositMax_ Maximumn amount of tokens that can be deposited to this contract. Will be disabled if equal 0.
     * @param depositUserMax_ Maximum amount a single account can deposit to this contract. Will be disabled if equal 0.
     * @param whitelist_ List of addresses to add to the whitelist. If the array is empty, the whitelist will be disabled.
     */
    constructor(
        address token_,
        uint256 depositMax_,
        uint256 depositUserMax_,
        uint256 depositUserMin_,
        address[] memory whitelist_
    ) {
        token = token_;

        setLimits(depositMax_, depositUserMax_, depositUserMin_);
        addToWhitelist(whitelist_);
    }

    /**
     * @dev Transfers the `depositAmount` from the caller to this contract.
     *      Prior calling this function, user must give thios contract an allowance >= `depositAmount`.
     */
    function deposit(uint256 depositAmount)
        external
        nonReentrant
        whenNotPaused
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

        require(
            IERC20(token).transferFrom(
                _msgSender(),
                address(this),
                depositAmount
            ),
            "ERC20 transfer failed"
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
     * @dev Used by the owner to withdraw all deposited funds to the `_msgSender()` address.
     */
    function withdraw(uint256 amount, bool pause_)
        external
        nonReentrant
        onlyOwner
    {
        require(
            IERC20(token).transfer(_msgSender(), amount),
            "ERC20 transfer failed"
        );

        emit Withdrawn(_msgSender());

        if (pause_) {
            _pause();
        }
    }

    /**
     * @dev Returns the account's current deposit.
     */
    function getAccountDeposit(address account)
        external
        view
        returns (uint256)
    {
        return deposits[account];
    }

    /**
     * @dev Returns the account's share of the total deposits.
     */
    function getAccountShare(address account) external view returns (uint256) {
        return deposits[account].mul(100).div(totalDeposits);
    }

    /**
     * @dev Returns true if the `account` is whitelisted.
     */
    function isWhitelisted(address account) public view returns (bool) {
        return whitelist[account];
    }

    /**
     * @dev Set the deposit limits.
     */
    function setLimits(uint256 depositMax_, uint256 depositUserMax_, uint256 depositUserMin_)
        public
        onlyOwner
    {
        depositMax = depositMax_;
        depositUserMax = depositUserMax_;
        depositUserMin = depositUserMin_;
    }

    /**
     * @dev Adds a list of accounts to the whitelist.
     */
    function addToWhitelist(address[] memory accounts_) public onlyOwner {
        for (uint256 index = 0; index < accounts_.length; index++) {
            whitelist[accounts_[index]] = true;
            emit WhitelistEntryAdded(accounts_[index]);
        }

        whitelistLength += accounts_.length;
    }

    /**
     * @dev Removes a list of accounts from the whitelist.
     */
    function removeFromWhitelist(address[] memory accounts_) public onlyOwner {
        for (uint256 index = 0; index < accounts_.length; index++) {
            whitelist[accounts_[index]] = false;
            emit WhitelistEntryRemoved(accounts_[index]);
        }

        whitelistLength -= accounts_.length;
    }

    /**
     * @dev External function to pause the deposits.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev External function to pause the deposits.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Revert the transaction if the owner tries to renounce the ownership.
     *      If this would happen, all funds would be trapped in this contract.
     */
    function renounceOwnership() public virtual override onlyOwner {
        revert("Renounce not allowed");
    }
}
