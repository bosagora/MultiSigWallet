// SPDX-License-Identifier: LGPL-3.0

pragma solidity ^0.8.2;

interface IMultiSigWalletFactory {
    function create(address[] memory _owners, uint256 _required) external returns (address);
    function getNumberOfWalletsForCreator(address _creator) external view returns (uint256);
    function getWalletsForCreator(
        address _creator,
        uint256 _from,
        uint256 _to
    ) external view returns (address[] memory);

    function addOwner(address _owner, address _wallet) external;
    function removeOwner(address _owner, address _wallet) external;

    function getNumberOfWalletsForOwner(address _owner) external view returns (uint256);
    function getWalletsForOwner(address _owner, uint256 _from, uint256 _to) external view returns (address[] memory);
}
