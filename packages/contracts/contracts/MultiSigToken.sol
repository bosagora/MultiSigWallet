// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./IMultiSigWallet.sol";

contract MultiSigToken is ERC20 {
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can execute");
        _;
    }

    constructor(address _owner) ERC20("Multi Sig Token", "MTK") {
        owner = _owner;
        require(
            IMultiSigWallet(owner).supportsInterface(type(IMultiSigWallet).interfaceId),
            "Invalid interface ID of multi sig wallet"
        );
    }

    function mint(uint256 _amount) external onlyOwner {
        _mint(owner, _amount);
    }
}
