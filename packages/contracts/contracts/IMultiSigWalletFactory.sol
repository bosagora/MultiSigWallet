// SPDX-License-Identifier: LGPL-3.0

pragma solidity ^0.8.2;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IMultiSigWalletFactory is IERC165 {
    struct WalletInfo {
        address creator;
        address wallet;
        string name;
        string description;
        uint256 createdTime;
    }
    function create(
        string calldata _name,
        string calldata _description,
        address[] memory _owners,
        uint256 _required
    ) external returns (address);
    function register(address payable _wallet) external;
    function getNumberOfWalletsForCreator(address _creator) external view returns (uint256);
    function getWalletsForCreator(
        address _creator,
        uint256 _from,
        uint256 _to
    ) external view returns (WalletInfo[] memory);
    function getWalletInfo(address _wallet) external view returns (WalletInfo memory);

    function addMember(address _member, address _wallet) external;
    function removeMember(address _member, address _wallet) external;

    function getNumberOfWalletsForMember(address _member) external view returns (uint256);
    function getWalletsForMember(
        address _member,
        uint256 _from,
        uint256 _to
    ) external view returns (WalletInfo[] memory);
}
