// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IMultiSigWallet is IERC165 {
    function submitTransaction(address _destination, uint256 _value, bytes calldata _data) external;
    function confirmTransaction(uint256 _transactionId) external;
    function revokeConfirmation(uint256 _transactionId) external;
    function executeTransaction(uint256 _transactionId) external;
    function getConfirmationCount(uint256 _transactionId) external view returns (uint256);
    function getTransactionCount(bool _pending, bool _executed) external view returns (uint256);
    function getOwners() external view returns (address[] memory);
    function getConfirmations(uint256 _transactionId) external view returns (address[] memory);
    function getTransactionIds(
        uint256 _from,
        uint256 _to,
        bool _pending,
        bool _executed
    ) external view returns (uint256[] memory);
}
