// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IMultiSigWallet is IERC165 {
    struct Transaction {
        address destination;
        uint256 value;
        bytes data;
        bool executed;
    }

    function getOwners() external view returns (address[] memory);
    function getRequired() external view returns (uint256);

    function isOwner(address _address) external view returns (bool);

    function getTransactionCount() external view returns (uint256);
    function getTransaction(uint256 _transactionId) external view returns (Transaction memory);
    function getTransactionsInRange(uint256 _from, uint256 _to) external view returns (Transaction[] memory);

    function getConfirmationCount(uint256 _transactionId) external view returns (uint256);
    function getConfirmations(uint256 _transactionId) external view returns (address[] memory);

    function submitTransaction(address _destination, uint256 _value, bytes calldata _data) external;
    function confirmTransaction(uint256 _transactionId) external;
    function revokeConfirmation(uint256 _transactionId) external;
    function executeTransaction(uint256 _transactionId) external;

    function getTransactionCountInCondition(bool _pending, bool _executed) external view returns (uint256);
    function getTransactionIdsInCondition(
        uint256 _from,
        uint256 _to,
        bool _pending,
        bool _executed
    ) external view returns (uint256[] memory);
}
