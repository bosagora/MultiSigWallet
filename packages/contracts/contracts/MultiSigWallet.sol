// SPDX-License-Identifier: LGPL-3.0

pragma solidity ^0.8.2;

/// @title Multisignature wallet - Allows multiple parties to agree on transactions before execution.
/// @author Stefan George - <stefan.george@consensys.net>
contract MultiSigWallet {
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
    mapping(uint256 => Transaction) public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmations;
    mapping(address => bool) public isOwner;
    address[] public owners;
    uint256 public required;
    uint256 public transactionCount;

    struct Transaction {
        address destination;
        uint256 value;
        bytes data;
        bool executed;
    }

    /*
     *  Modifiers
     */
    modifier onlyWallet() {
        require(msg.sender == address(this));
        _;
    }

    modifier ownerDoesNotExist(address _owner) {
        require(!isOwner[_owner]);
        _;
    }

    modifier ownerExists(address _owner) {
        require(isOwner[_owner]);
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
    /// @param _owners List of initial owners.
    /// @param _required Number of required confirmations.
    constructor(address[] memory _owners, uint256 _required) {
        require(
            _owners.length <= MAX_OWNER_COUNT && _required <= _owners.length && _required != 0 && _owners.length != 0
        );

        for (uint256 i = 0; i < _owners.length; i++) {
            require(!isOwner[_owners[i]] && _owners[i] != address(0));
            isOwner[_owners[i]] = true;
        }
        owners = _owners;
        required = _required;
    }

    receive() external payable {
        if (msg.value > 0) emit Deposit(msg.sender, msg.value);
    }

    /// @dev Allows to add a new owner. Transaction has to be sent by wallet.
    /// @param _owner Address of new owner.
    function addOwner(
        address _owner
    ) public onlyWallet ownerDoesNotExist(_owner) notNull(_owner) validRequirement(owners.length + 1, required) {
        isOwner[_owner] = true;
        owners.push(_owner);
        emit OwnerAddition(_owner);
    }

    /// @dev Allows to remove an owner. Transaction has to be sent by wallet.
    /// @param _owner Address of owner.
    function removeOwner(address _owner) public onlyWallet ownerExists(_owner) {
        isOwner[_owner] = false;
        for (uint256 i = 0; i < owners.length - 1; i++)
            if (owners[i] == _owner) {
                owners[i] = owners[owners.length - 1];
                break;
            }
        owners.pop();
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
        isOwner[_owner] = false;
        isOwner[_newOwner] = true;
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
    /// @return transaction ID.
    function submitTransaction(address _destination, uint256 _value, bytes calldata _data) public returns (uint256) {
        uint256 transactionId = addTransaction(_destination, _value, _data);
        confirmTransaction(transactionId);
        return transactionId;
    }

    /// @dev Allows an owner to confirm a transaction.
    /// @param _transactionId Transaction ID.
    function confirmTransaction(
        uint256 _transactionId
    ) public ownerExists(msg.sender) transactionExists(_transactionId) notConfirmed(_transactionId, msg.sender) {
        confirmations[_transactionId][msg.sender] = true;
        emit Confirmation(msg.sender, _transactionId);
        executeTransaction(_transactionId);
    }

    /// @dev Allows an owner to revoke a confirmation for a transaction.
    /// @param _transactionId Transaction ID.
    function revokeConfirmation(
        uint256 _transactionId
    ) public ownerExists(msg.sender) confirmed(_transactionId, msg.sender) notExecuted(_transactionId) {
        confirmations[_transactionId][msg.sender] = false;
        emit Revocation(msg.sender, _transactionId);
    }

    /// @dev Allows anyone to execute a confirmed transaction.
    /// @param _transactionId Transaction ID.
    function executeTransaction(
        uint256 _transactionId
    ) public virtual ownerExists(msg.sender) confirmed(_transactionId, msg.sender) notExecuted(_transactionId) {
        if (isConfirmed(_transactionId)) {
            Transaction storage txn = transactions[_transactionId];
            txn.executed = true;
            bytes memory data = txn.data;
            if (external_call(txn.destination, txn.value, txn.data.length, data)) emit Execution(_transactionId);
            else {
                emit ExecutionFailure(_transactionId);
                txn.executed = false;
            }
        }
    }

    // call has been separated into its own function in order to take advantage
    // of the Solidity's code generator to produce a loop that copies tx.data into memory.
    function external_call(
        address _destination,
        uint256 _value,
        uint256 _dataLength,
        bytes memory _data
    ) internal returns (bool) {
        bool result;
        assembly {
            let x := mload(0x40) // "Allocate" memory for output (0x40 is where "free memory" pointer is stored by convention)
            let d := add(_data, 32) // First 32 bytes are the padded length of data, so exclude that
            result := call(
                sub(gas(), 34710), // 34710 is the value that solidity is currently emitting
                // It includes callGas (700) + callVeryLow (3, to pay for SUB) + callValueTransferGas (9000) +
                // callNewAccountGas (25000, in case the destination address does not exist and needs creating)
                _destination,
                _value,
                d,
                _dataLength, // Size of the input (in bytes) - this is what fixes the padding problem
                x,
                0 // Output is ignored, therefore the output size is zero
            )
        }
        return result;
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
        address _destination,
        uint256 _value,
        bytes calldata _data
    ) internal notNull(_destination) returns (uint256) {
        uint256 transactionId = transactionCount;
        transactions[transactionId] = Transaction({
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
    function getConfirmationCount(uint256 _transactionId) public view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < owners.length; i++) if (confirmations[_transactionId][owners[i]]) count += 1;
        return count;
    }

    /// @dev Returns total number of transactions after filers are applied.
    /// @param _pending Include pending transactions.
    /// @param _executed Include executed transactions.
    /// @return number of transactions after filters are applied.
    function getTransactionCount(bool _pending, bool _executed) public view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < transactionCount; i++)
            if ((_pending && !transactions[i].executed) || (_executed && transactions[i].executed)) count += 1;
        return count;
    }

    /// @dev Returns list of owners.
    /// @return array of owner addresses.
    function getOwners() public view returns (address[] memory) {
        return owners;
    }

    /// @dev Returns array with owner addresses, which confirmed transaction.
    /// @param _transactionId Transaction ID.
    /// @return array of owner addresses.
    function getConfirmations(uint256 _transactionId) public view returns (address[] memory) {
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
    function getTransactionIds(
        uint256 _from,
        uint256 _to,
        bool _pending,
        bool _executed
    ) public view returns (uint256[] memory) {
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
}
