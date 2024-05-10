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
    event Registered(address wallet);
    event ChangedName(address wallet, string name);
    event ChangedDescription(address wallet, string description);

    /*
     *  Storage
     */
    mapping(address => bool) internal hasWallets;
    mapping(address => address[]) internal wallets;

    /*
     * Public functions
     */
    /// @dev Allows verified creation of multi-signature wallet.
    /// @param _name List of initial owners.
    /// @param _description List of initial owners.
    /// @param _owners List of initial owners.
    /// @param _required Number of required confirmations.
    /// @return wallet address.
    function create(
        string calldata _name,
        string calldata _description,
        address[] memory _owners,
        uint256 _required
    ) external override returns (address) {
        address wallet = address(
            new MultiSigWallet(address(this), _name, _description, msg.sender, _owners, _required)
        );

        emit ContractInstantiation(msg.sender, wallet);

        return wallet;
    }

    /// @dev Registers contract in factory registry.
    /// @param _wallet Address of contract instantiation.
    function register(address payable _wallet) external override onlyNotRegisteredWallet(_wallet) {
        require(
            IMultiSigWallet(_wallet).supportsInterface(type(IMultiSigWallet).interfaceId),
            "Invalid interface ID of multi sig wallet"
        );
        MultiSigWallet msw = MultiSigWallet(_wallet);
        address[] memory members = msw.getMembers();
        for (uint256 idx = 0; idx < members.length; idx++) {
            _addMember(members[idx], _wallet);
        }
        hasWallets[_wallet] = true;
        wallets[msg.sender].push(_wallet);

        emit Registered(_wallet);
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
    ) external view override returns (WalletInfo[] memory) {
        WalletInfo[] memory values = new WalletInfo[](_to - _from);
        for (uint256 i = _from; i < _to; i++) {
            address wallet = wallets[_creator][i];
            IMultiSigWallet msw = IMultiSigWallet(wallet);
            values[i - _from] = WalletInfo({
                creator: msw.creator(),
                wallet: wallet,
                name: msw.name(),
                description: msw.description(),
                createdTime: msw.createdTime()
            });
        }
        return values;
    }

    /// @dev Returns information of the wallet
    /// @param _wallet Address of wallet
    /// @return information of wallet
    function getWalletInfo(address _wallet) external view override returns (WalletInfo memory) {
        IMultiSigWallet msw = IMultiSigWallet(_wallet);
        return
            WalletInfo({
                creator: msw.creator(),
                wallet: _wallet,
                name: msw.name(),
                description: msw.description(),
                createdTime: msw.createdTime()
            });
    }

    mapping(address => address[]) internal walletsForOwnerValues;
    mapping(address => mapping(address => uint256)) internal walletsForOwnerIndexes;

    modifier onlyWallet(address _wallet) {
        require(msg.sender == _wallet);
        _;
    }

    modifier onlyRegisteredWallet(address _wallet) {
        require(hasWallets[_wallet]);
        _;
    }

    modifier onlyNotRegisteredWallet(address _wallet) {
        require(!hasWallets[_wallet]);
        _;
    }

    /// @dev Add a new owner on wallet
    /// @param _member Address of new owner.
    /// @param _member Address of wallet.
    function addMember(
        address _member,
        address _wallet
    ) external override onlyWallet(_wallet) onlyRegisteredWallet(_wallet) {
        _addMember(_member, _wallet);
    }

    /// @dev Remove a new owner on wallet
    /// @param _member Address of removed owner.
    /// @param _member Address of wallet.
    function removeMember(
        address _member,
        address _wallet
    ) external override onlyWallet(_wallet) onlyRegisteredWallet(_wallet) {
        _removeMember(_member, _wallet);
    }

    /// @dev Returns number of wallets by owner.
    /// @param _member Address of owner.
    function getNumberOfWalletsForMember(address _member) external view override returns (uint256) {
        return walletsForOwnerValues[_member].length;
    }

    /// @dev Returns list of the owner's wallet
    /// @param _from Index start position of wallet array.
    /// @param _to Index end position of wallet array.
    /// @return array of wallets.
    function getWalletsForMember(
        address _member,
        uint256 _from,
        uint256 _to
    ) external view override returns (WalletInfo[] memory) {
        WalletInfo[] memory values = new WalletInfo[](_to - _from);
        for (uint256 i = _from; i < _to; i++) {
            address wallet = walletsForOwnerValues[_member][i];
            IMultiSigWallet msw = IMultiSigWallet(wallet);
            values[i - _from] = WalletInfo({
                creator: msw.creator(),
                wallet: wallet,
                name: msw.name(),
                description: msw.description(),
                createdTime: msw.createdTime()
            });
        }
        return values;
    }

    /*
     * Internal functions
     */

    /// @dev Add a new owner on wallet
    /// @param _member Address of new owner.
    /// @param _member Address of wallet.
    function _addMember(address _member, address _wallet) internal {
        if (walletsForOwnerIndexes[_member][_wallet] == 0) {
            walletsForOwnerValues[_member].push(_wallet);
            walletsForOwnerIndexes[_member][_wallet] = walletsForOwnerValues[_member].length;
        }
    }

    /// @dev Remove a new owner on wallet
    /// @param _member Address of removed owner.
    /// @param _member Address of wallet.
    function _removeMember(address _member, address _wallet) internal {
        uint256 valueIndex = walletsForOwnerIndexes[_member][_wallet];
        if (valueIndex != 0) {
            uint256 toDeleteIndex = valueIndex - 1;
            uint256 lastIndex = walletsForOwnerValues[_member].length - 1;

            if (lastIndex != toDeleteIndex) {
                address lastValue = walletsForOwnerValues[_member][lastIndex];

                // Move the last value to the index where the value to delete is
                walletsForOwnerValues[_member][toDeleteIndex] = lastValue;
                // Update the index for the moved value
                walletsForOwnerIndexes[_member][lastValue] = valueIndex; // Replace lastValue's index to valueIndex
            }

            // Delete the slot where the moved value was stored
            walletsForOwnerValues[_member].pop();

            // Delete the index for the deleted slot
            delete walletsForOwnerIndexes[_member][_wallet];
        }
    }
}
