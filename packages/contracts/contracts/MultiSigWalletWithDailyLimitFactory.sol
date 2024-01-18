// SPDX-License-Identifier: LGPL-3.0

pragma solidity ^0.8.2;

import "./Factory.sol";
import "./MultiSigWalletWithDailyLimit.sol";

/// @title Multisignature wallet factory for daily limit version - Allows creation of multisig wallet.
/// @author Stefan George - <stefan.george@consensys.net>
contract MultiSigWalletWithDailyLimitFactory is Factory {
    /*
     * Public functions
     */
    /// @dev Allows verified creation of multisignature wallet.
    /// @param _owners List of initial owners.
    /// @param _required Number of required confirmations.
    /// @param _dailyLimit Amount in wei, which can be withdrawn without confirmations on a daily basis.
    /// @return wallet address.
    function create(address[] memory _owners, uint256 _required, uint256 _dailyLimit) public returns (address) {
        address wallet = address(new MultiSigWalletWithDailyLimit(_owners, _required, _dailyLimit));
        register(wallet);
        return wallet;
    }
}
