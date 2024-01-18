// SPDX-License-Identifier: LGPL-3.0

pragma solidity ^0.8.2;

import "./Factory.sol";
import "./MultiSigWallet.sol";

/// @title Multi-Signature wallet factory - Allows creation of multisig wallet.
/// @author Stefan George - <stefan.george@consensys.net>
contract MultiSigWalletFactory is Factory {
    /*
     * Public functions
     */
    /// @dev Allows verified creation of multi-signature wallet.
    /// @param _owners List of initial owners.
    /// @param _required Number of required confirmations.
    /// @return wallet address.
    function create(address[] memory _owners, uint256 _required) public returns (address) {
        address wallet = address(new MultiSigWallet(_owners, _required));
        register(wallet);
        return wallet;
    }
}
