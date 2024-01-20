// SPDX-License-Identifier: LGPL-3.0

pragma solidity ^0.8.2;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import "./MultiSigWallet.sol";
import "./IMultiSigWalletFactory.sol";

/// @title Multi-Signature wallet factory - Allows creation of multisig wallet.
/// @author Stefan George - <stefan.george@consensys.net>
contract MultiSigWalletFactory is ERC165, IMultiSigWalletFactory {
    /*
     *  Events
     */
    event ContractInstantiation(address sender, address wallet);

    /*
     *  Storage
     */
    mapping(address => bool) internal hasWallets;
    mapping(address => address[]) internal wallets;

    /*
     * Public functions
     */
    /// @dev Allows verified creation of multi-signature wallet.
    /// @param _owners List of initial owners.
    /// @param _required Number of required confirmations.
    /// @return wallet address.
    function create(address[] memory _owners, uint256 _required) external override returns (address) {
        address wallet = address(new MultiSigWallet(address(this), _owners, _required));
        for (uint256 idx = 0; idx < _owners.length; idx++) {
            _addOwner(_owners[idx], wallet);
        }
        register(wallet);
        return wallet;
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IMultiSigWalletFactory).interfaceId || super.supportsInterface(interfaceId);
    }

    /// @dev Returns number of instantiations by creator.
    /// @param _creator Contract creator.
    /// @return number of instantiations by creator.
    function getNumberOfWalletsForCreator(address _creator) external view override returns (uint256) {
        return wallets[_creator].length;
    }

    /// @dev Returns list of the created wallet
    /// @param _from Index start position of wallet array.
    /// @param _to Index end position of wallet array.
    /// @return array of wallets.
    function getWalletsForCreator(
        address _creator,
        uint256 _from,
        uint256 _to
    ) external view override returns (address[] memory) {
        address[] memory values = new address[](_to - _from);
        for (uint256 i = _from; i < _to; i++) {
            values[i - _from] = wallets[_creator][i];
        }
        return values;
    }

    mapping(address => address[]) internal walletsForOwnerValues;
    mapping(address => mapping(address => uint256)) internal walletsForOwnerIndexes;

    /// @dev Add a new owner on wallet
    /// @param _owner Address of new owner.
    /// @param _owner Address of wallet.
    function addOwner(address _owner, address _wallet) external override {
        _addOwner(_owner, _wallet);
    }

    /// @dev Remove a new owner on wallet
    /// @param _owner Address of removed owner.
    /// @param _owner Address of wallet.
    function removeOwner(address _owner, address _wallet) external override {
        _removeOwner(_owner, _wallet);
    }

    /// @dev Returns number of wallets by owner.
    /// @param _owner Address of owner.
    function getNumberOfWalletsForOwner(address _owner) external view override returns (uint256) {
        return walletsForOwnerValues[_owner].length;
    }

    /// @dev Returns list of the owner's wallet
    /// @param _from Index start position of wallet array.
    /// @param _to Index end position of wallet array.
    /// @return array of wallets.
    function getWalletsForOwner(
        address _owner,
        uint256 _from,
        uint256 _to
    ) external view override returns (address[] memory) {
        address[] memory values = new address[](_to - _from);
        for (uint256 i = _from; i < _to; i++) {
            values[i - _from] = walletsForOwnerValues[_owner][i];
        }
        return values;
    }

    /*
     * Internal functions
     */
    /// @dev Registers contract in factory registry.
    /// @param _wallet Address of contract instantiation.
    function register(address _wallet) internal {
        hasWallets[_wallet] = true;
        wallets[msg.sender].push(_wallet);
        emit ContractInstantiation(msg.sender, _wallet);
    }

    /// @dev Add a new owner on wallet
    /// @param _owner Address of new owner.
    /// @param _owner Address of wallet.
    function _addOwner(address _owner, address _wallet) internal {
        if (walletsForOwnerIndexes[_owner][_wallet] == 0) {
            walletsForOwnerValues[_owner].push(_wallet);
            walletsForOwnerIndexes[_owner][_wallet] = walletsForOwnerValues[_owner].length;
        }
    }

    /// @dev Remove a new owner on wallet
    /// @param _owner Address of removed owner.
    /// @param _owner Address of wallet.
    function _removeOwner(address _owner, address _wallet) internal {
        uint256 valueIndex = walletsForOwnerIndexes[_owner][_wallet];
        if (valueIndex != 0) {
            uint256 toDeleteIndex = valueIndex - 1;
            uint256 lastIndex = walletsForOwnerValues[_owner].length - 1;

            if (lastIndex != toDeleteIndex) {
                address lastValue = walletsForOwnerValues[_owner][lastIndex];

                // Move the last value to the index where the value to delete is
                walletsForOwnerValues[_owner][toDeleteIndex] = lastValue;
                // Update the index for the moved value
                walletsForOwnerIndexes[_owner][lastValue] = valueIndex; // Replace lastValue's index to valueIndex
            }

            // Delete the slot where the moved value was stored
            walletsForOwnerValues[_owner].pop();

            // Delete the index for the deleted slot
            delete walletsForOwnerIndexes[_owner][_wallet];
        }
    }
}
