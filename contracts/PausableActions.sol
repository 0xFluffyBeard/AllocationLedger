// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Context.sol";

/**
 * @dev Contract which allows children to implement an emergency stop
 * for different types of actions.
 *
 * @notice Based on OpenZeppelin pausable
 * See: https://docs.openzeppelin.com/contracts/4.x/api/security#Pausable
 */
abstract contract PausableActions is Context {
    // Constant with the name of the default action.
    bytes32 public constant PAUSE_ACTION_DEFAULT = 0x00;

    /**
     * @dev Emitted when `account` triggers the pause for `action`
     */
    event Paused(address account, bytes32 action);

    /**
     * @dev Emitted when `account` lifts the pause for `action`
     */
    event Unpaused(address account, bytes32 action);

    // Mapping with the pause state of different actions.
    mapping(bytes32 => bool) public _pausedActions;

    /**
     * Returns true if the default action is paused, and false otherwise.
     */
    function paused() public view virtual returns (bool) {
        return _pausedActions[PAUSE_ACTION_DEFAULT];
    }

    /**
     * Returns true if the `action` is paused, and false otherwise.
     */
    function pausedAction(bytes32 action) public view virtual returns (bool) {
        return _pausedActions[action];
    }

    /**
     * @dev Modifier to make a function callable only when the default action is not paused.
     *
     * Requirements:
     *
     * - The default action must not be paused.
     */
    modifier whenNotPaused() {
        require(!paused(), "Pausable: paused");
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the `action` is paused.
     *
     * Requirements:
     *
     * - The `action` must not be paused.
     */
    modifier whenNotPausedAction(bytes32 action) {
        require(!pausedAction(action), "Pausable: paused");
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the default action is  paused.
     *
     * Requirements:
     *
     * - The default action must be paused.
     */
    modifier whenPaused() {
        require(paused(), "Pausable: not paused");
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the `action` is  paused.
     *
     * Requirements:
     *
     * - The `action` must be paused.
     */
    modifier whenPausedAction(bytes32 action) {
        require(pausedAction(action), "Pausable: not paused");
        _;
    }

    /**
     * @dev Triggers paused state for default action.
     *
     * Requirements:
     *
     * - Default action must not be paused.
     */
    function _pause() internal virtual whenNotPaused {
        _pause(PAUSE_ACTION_DEFAULT);
    }

    /**
     * @dev Triggers paused state for `action`.
     *
     * Requirements:
     *
     * - `action` must not be paused.
     */
    function _pause(bytes32 action) internal virtual whenNotPausedAction(action) {
        _pausedActions[action] = true;
        emit Paused(_msgSender(), action);
    }

    /**
     * @dev Returns to normal state for default action.
     *
     * Requirements:
     *
     * - The default action must be paused.
     */
    function _unpause() internal virtual whenPaused {
        _unpause(PAUSE_ACTION_DEFAULT);
    }

    /**
     * @dev Returns to normal state for `action`.
     *
     * Requirements:
     *
     * - The `action` must be paused.
     */
    function _unpause(bytes32 action) internal virtual whenPausedAction(action) {
        _pausedActions[action] = false;
        emit Unpaused(_msgSender(), action);
    }
}