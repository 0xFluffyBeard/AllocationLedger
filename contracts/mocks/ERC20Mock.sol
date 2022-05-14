//SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.5;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
    constructor(address[] memory accouns) ERC20("Token", "TKN") {
        _mint(_msgSender(), 100000 ether);
        for (uint256 index = 0; index < accouns.length; index++) {
            _mint(accouns[index], 10000 ether);
        }
    }
}
