// SPDX-License-Identifier: LGPL-3.0

pragma solidity ^0.8.2;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import "./IMultiSigWallet.sol";
import "./IMultiSigWalletFactory.sol";

/// @title Multisignature wallet - Allows multiple parties to agree on transactions before execution.
/// @author Stefan George - <stefan.george@consensys.net>
contract MultiSigWallet is ERC165, IMultiSigWallet {
    /*
     *  Events
     */
    event Confirmation(address indexed sender, uint256 indexed transactionId);
    event Revocation(address indexed sender, uint256 indexed transactionId);
    event Submission(uint256 indexed transactionId);
    event Execution(uint256 indexed transactionId);
    event ExecutionFailure(uint256 indexed transactionId);
    event Deposit(address indexed sender, uint256 value);
    event OwnerAddition(address indexed owner);
    event OwnerRemoval(address indexed owner);
    event RequirementChange(uint256 required);

    /*
     *  Constants
     */
    uint256 public MAX_OWNER_COUNT = 50;

    /*
     *  Storage
     */
    string public name;
    string public description;
    address public creator;
    uint256 public createdTime;

    mapping(uint256 => Transaction) internal transactions;
    mapping(uint256 => mapping(address => bool)) internal confirmations;
    mapping(address => bool) internal ownerMap;
    address[] internal owners;
    uint256 internal required;
    uint256 internal transactionCount;
    address internal factoryAddress;

    /*
     *  Modifiers
     */
    modifier onlyWallet() {
        require(msg.sender == address(this));
        _;
    }

    modifier ownerDoesNotExist(address _owner) {
        require(!ownerMap[_owner]);
        _;
    }

    modifier ownerExists(address _owner) {
        require(ownerMap[_owner]);
        _;
    }

    modifier transactionExists(uint256 _transactionId) {
        require(transactions[_transactionId].destination != address(0));
        _;
    }

    modifier confirmed(uint256 _transactionId, address _owner) {
        require(confirmations[_transactionId][_owner]);
        _;
    }

    modifier notConfirmed(uint256 _transactionId, address _owner) {
        require(!confirmations[_transactionId][_owner]);
        _;
    }

    modifier notExecuted(uint256 _transactionId) {
        require(!transactions[_transactionId].executed);
        _;
    }

    modifier notNull(address _address) {
        require(_address != address(0));
        _;
    }

    modifier validRequirement(uint256 _ownerCount, uint256 _required) {
        require(_ownerCount <= MAX_OWNER_COUNT && _required <= _ownerCount && _required != 0 && _ownerCount != 0);
        _;
    }

    /*
     * Public functions
     */
    /// @dev Contract constructor sets initial owners and required number of confirmations.
    /// @param _factory MultiSigWalletFactory.
    /// @param _owners List of initial owners.
    /// @param _required Number of required confirmations.
    constructor(
        address _factory,
        string memory _name,
        string memory _description,
        address _creator,
        address[] memory _owners,
        uint256 _required
    ) {
        require(
            _owners.length <= MAX_OWNER_COUNT && _required <= _owners.length && _required != 0 && _owners.length != 0
        );

        factoryAddress = _factory;
        name = _name;
        description = _description;
        creator = _creator;
        createdTime = block.timestamp;

        for (uint256 i = 0; i < _owners.length; i++) {
            require(!ownerMap[_owners[i]] && _owners[i] != address(0));
            ownerMap[_owners[i]] = true;
        }
        owners = _owners;
        required = _required;
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IMultiSigWallet).interfaceId || super.supportsInterface(interfaceId);
    }

    receive() external payable {
        if (msg.value > 0) emit Deposit(msg.sender, msg.value);
    }

    /// @dev Allows to add a new owner. Transaction has to be sent by wallet.
    /// @param _owner Address of new owner.
    function addOwner(
        address _owner
    ) public onlyWallet ownerDoesNotExist(_owner) notNull(_owner) validRequirement(owners.length + 1, required) {
        ownerMap[_owner] = true;
        owners.push(_owner);
        if (factoryAddress != address(0)) IMultiSigWalletFactory(factoryAddress).addOwner(_owner, address(this));
        emit OwnerAddition(_owner);
    }

    /// @dev Allows to remove an owner. Transaction has to be sent by wallet.
    /// @param _owner Address of owner.
    function removeOwner(address _owner) public onlyWallet ownerExists(_owner) {
        ownerMap[_owner] = false;
        for (uint256 i = 0; i < owners.length - 1; i++)
            if (owners[i] == _owner) {
                owners[i] = owners[owners.length - 1];
                break;
            }
        owners.pop();
        if (factoryAddress != address(0)) IMultiSigWalletFactory(factoryAddress).removeOwner(_owner, address(this));
        if (required > owners.length) changeRequirement(owners.length);
        emit OwnerRemoval(_owner);
    }

    /// @dev Allows to replace an owner with a new owner. Transaction has to be sent by wallet.
    /// @param _owner Address of owner to be replaced.
    /// @param _newOwner Address of new owner.
    function replaceOwner(
        address _owner,
        address _newOwner
    ) public onlyWallet ownerExists(_owner) ownerDoesNotExist(_newOwner) {
        for (uint256 i = 0; i < owners.length; i++)
            if (owners[i] == _owner) {
                owners[i] = _newOwner;
                break;
            }
        ownerMap[_owner] = false;
        ownerMap[_newOwner] = true;
        if (factoryAddress != address(0)) IMultiSigWalletFactory(factoryAddress).removeOwner(_owner, address(this));
        if (factoryAddress != address(0)) IMultiSigWalletFactory(factoryAddress).addOwner(_newOwner, address(this));
        emit OwnerRemoval(_owner);
        emit OwnerAddition(_newOwner);
    }

    /// @dev Allows to change the number of required confirmations. Transaction has to be sent by wallet.
    /// @param _required Number of required confirmations.
    function changeRequirement(uint256 _required) public onlyWallet validRequirement(owners.length, _required) {
        required = _required;
        emit RequirementChange(_required);
    }

    /// @dev Allows an owner to submit and confirm a transaction.
    /// @param _destination Transaction target address.
    /// @param _value Transaction ether value.
    /// @param _data Transaction data payload.
    function submitTransaction(
        string memory _title,
        string memory _description,
        address _destination,
        uint256 _value,
        bytes calldata _data
    ) external override {
        uint256 transactionId = addTransaction(_title, _description, _destination, _value, _data);
        _confirmTransaction(transactionId);
    }

    /// @dev Allows an owner to confirm a transaction.
    /// @param _transactionId Transaction ID.
    function confirmTransaction(uint256 _transactionId) external override {
        _confirmTransaction(_transactionId);
    }

    /// @dev Allows an owner to confirm a transaction.
    /// @param _transactionId Transaction ID.
    function _confirmTransaction(
        uint256 _transactionId
    ) internal ownerExists(msg.sender) transactionExists(_transactionId) notConfirmed(_transactionId, msg.sender) {
        confirmations[_transactionId][msg.sender] = true;
        emit Confirmation(msg.sender, _transactionId);
        _executeTransaction(_transactionId);
    }

    /// @dev Allows an owner to revoke a confirmation for a transaction.
    /// @param _transactionId Transaction ID.
    function revokeConfirmation(
        uint256 _transactionId
    ) external override ownerExists(msg.sender) confirmed(_transactionId, msg.sender) notExecuted(_transactionId) {
        confirmations[_transactionId][msg.sender] = false;
        emit Revocation(msg.sender, _transactionId);
    }

    /// @dev Allows anyone to execute a confirmed transaction.
    /// @param _transactionId Transaction ID.
    function executeTransaction(uint256 _transactionId) external override {
        _executeTransaction(_transactionId);
    }

    /// @dev Allows anyone to execute a confirmed transaction.
    /// @param _transactionId Transaction ID.
    function _executeTransaction(
        uint256 _transactionId
    ) internal ownerExists(msg.sender) confirmed(_transactionId, msg.sender) notExecuted(_transactionId) {
        if (isConfirmed(_transactionId)) {
            Transaction storage txn = transactions[_transactionId];
            txn.executed = true;
            bytes memory data = txn.data;
            if (external_call(txn.destination, txn.value, data)) emit Execution(_transactionId);
            else {
                emit ExecutionFailure(_transactionId);
                txn.executed = false;
            }
        }
    }

    // call has been separated into its own function in order to take advantage
    // of the Solidity's code generator to produce a loop that copies tx.data into memory.
    function external_call(address _destination, uint256 _value, bytes memory _data) internal returns (bool) {
        (bool success, ) = _destination.call{ value: _value }(_data);
        return success;
    }

    /// @dev Returns the confirmation status of a transaction.
    /// @param _transactionId Transaction ID.
    /// @return confirmation status.
    function isConfirmed(uint256 _transactionId) public view returns (bool) {
        uint256 count = 0;
        for (uint256 i = 0; i < owners.length; i++) {
            if (confirmations[_transactionId][owners[i]]) count += 1;
            if (count == required) return true;
        }
        return false;
    }

    /*
     * Internal functions
     */
    /// @dev Adds a new transaction to the transaction mapping, if transaction does not exist yet.
    /// @param _destination Transaction target address.
    /// @param _value Transaction ether value.
    /// @param _data Transaction data payload.
    /// @return transaction ID.
    function addTransaction(
        string memory _title,
        string memory _description,
        address _destination,
        uint256 _value,
        bytes calldata _data
    ) internal notNull(_destination) returns (uint256) {
        uint256 transactionId = transactionCount;
        transactions[transactionId] = Transaction({
            id: transactionId,
            title: _title,
            description: _description,
            creator: msg.sender,
            createdTime: block.timestamp,
            destination: _destination,
            value: _value,
            data: _data,
            executed: false
        });
        transactionCount += 1;
        emit Submission(transactionId);
        return transactionId;
    }

    /*
     * Web3 call functions
     */
    /// @dev Returns number of confirmations of a transaction.
    /// @param _transactionId Transaction ID.
    /// @return number of confirmations.
    function getConfirmationCount(uint256 _transactionId) external view override returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < owners.length; i++) if (confirmations[_transactionId][owners[i]]) count += 1;
        return count;
    }

    /// @dev Returns total number of transactions after filers are applied.
    /// @param _pending Include pending transactions.
    /// @param _executed Include executed transactions.
    /// @return number of transactions after filters are applied.
    function getTransactionCountInCondition(bool _pending, bool _executed) external view override returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < transactionCount; i++)
            if ((_pending && !transactions[i].executed) || (_executed && transactions[i].executed)) count += 1;
        return count;
    }

    /// @dev Returns list of owners.
    /// @return array of owner addresses.
    function getOwners() external view override returns (address[] memory) {
        return owners;
    }

    /// @dev Returns array with owner addresses, which confirmed transaction.
    /// @param _transactionId Transaction ID.
    /// @return array of owner addresses.
    function getConfirmations(uint256 _transactionId) external view override returns (address[] memory) {
        address[] memory confirmationsTemp = new address[](owners.length);
        uint256 count = 0;
        uint256 i;
        for (i = 0; i < owners.length; i++)
            if (confirmations[_transactionId][owners[i]]) {
                confirmationsTemp[count] = owners[i];
                count += 1;
            }
        address[] memory values = new address[](count);
        for (i = 0; i < count; i++) values[i] = confirmationsTemp[i];
        return values;
    }

    /// @dev Returns list of transaction IDs in defined range.
    /// @param _from Index start position of transaction array.
    /// @param _to Index end position of transaction array.
    /// @param _pending Include pending transactions.
    /// @param _executed Include executed transactions.
    /// @return array of transaction IDs.
    function getTransactionIdsInCondition(
        uint256 _from,
        uint256 _to,
        bool _pending,
        bool _executed
    ) external view override returns (uint256[] memory) {
        uint256[] memory transactionIdsTemp = new uint256[](transactionCount);
        uint256 count = 0;
        uint256 i;
        for (i = 0; i < transactionCount; i++)
            if ((_pending && !transactions[i].executed) || (_executed && transactions[i].executed)) {
                transactionIdsTemp[count] = i;
                count += 1;
            }
        uint256[] memory values = new uint256[](_to - _from);
        for (i = _from; i < _to; i++) values[i - _from] = transactionIdsTemp[i];
        return values;
    }

    /// @dev Returns number of transactions
    function getTransactionCount() external view override returns (uint256) {
        return transactionCount;
    }

    /// @dev Returns transaction
    /// @param _transactionId Transaction ID.
    function getTransaction(uint256 _transactionId) external view override returns (Transaction memory) {
        return transactions[_transactionId];
    }

    /// @dev Returns list of transaction in defined range.
    /// @param _from Index start position of transaction array.
    /// @param _to Index end position of transaction array.
    /// @return array of transactions.
    function getTransactionsInRange(uint256 _from, uint256 _to) external view override returns (Transaction[] memory) {
        Transaction[] memory values = new Transaction[](_to - _from);
        for (uint256 i = _from; i < _to; i++) values[i - _from] = transactions[i];
        return values;
    }

    /// @dev Returns required
    function getRequired() external view override returns (uint256) {
        return required;
    }

    /// @dev Returns is owner
    function isOwner(address _address) external view override returns (bool) {
        return ownerMap[_address];
    }

    function getName() external view override returns (string memory) {
        return name;
    }

    function getDescription() external view override returns (string memory) {
        return description;
    }

    function getCreator() external view override returns (address) {
        return creator;
    }

    function getCreatedTime() external view override returns (uint256) {
        return createdTime;
    }
}
