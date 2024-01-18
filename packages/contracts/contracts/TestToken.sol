// SPDX-License-Identifier: LGPL-3.0

pragma solidity ^0.8.2;

/// @title Test token contract - Allows testing of token transfers with multisig wallet.
contract TestToken {
    /*
     *  Events
     */
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /*
     *  Constants
     */
    string public constant name = "Test Token";
    string public constant symbol = "TT";
    uint8 public constant decimals = 1;

    /*
     *  Storage
     */
    mapping(address => uint256) private balances;
    mapping(address => mapping(address => uint256)) private allowed;
    uint256 public totalSupply;

    /*
     * Public functions
     */
    /// @dev Issues new tokens.
    /// @param _to Address of token receiver.
    /// @param _value Number of tokens to issue.
    function issueTokens(address _to, uint256 _value) public {
        balances[_to] += _value;
        totalSupply += _value;
    }

    /*
     * This modifier is present in some real world token contracts, and due to a solidity
     * bug it was not compatible with multisig wallets
     */
    modifier onlyPayloadSize(uint size) {
        require(msg.data.length == size + 4);
        _;
    }

    /// @dev Transfers sender's tokens to a given address. Returns success.
    /// @param _to Address of token receiver.
    /// @param _value Number of tokens to transfer.
    /// @return success of function call.
    function transfer(address _to, uint256 _value) public onlyPayloadSize(2 * 32) returns (bool) {
        require(balances[msg.sender] >= _value);
        balances[msg.sender] -= _value;
        balances[_to] += _value;
        emit Transfer(msg.sender, _to, _value);
        return true;
    }

    /// @dev Allows allowed third party to transfer tokens from one address to another. Returns success.
    /// @param _from Address from where tokens are withdrawn.
    /// @param _to Address to where tokens are sent.
    /// @param _value Number of tokens to transfer.
    /// @return success of function call.
    function transferFrom(address _from, address _to, uint256 _value) public returns (bool) {
        require(balances[_from] >= _value && allowed[_from][msg.sender] >= _value);
        balances[_to] += _value;
        balances[_from] -= _value;
        allowed[_from][msg.sender] -= _value;
        emit Transfer(_from, _to, _value);
        return true;
    }

    /// @dev Sets approved amount of tokens for spender. Returns success.
    /// @param _spender Address of allowed account.
    /// @param _value Number of approved tokens.
    /// @return success of function call.
    function approve(address _spender, uint256 _value) public returns (bool) {
        allowed[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    /// @dev Returns number of allowed tokens for given address.
    /// @param _owner Address of token owner.
    /// @param _spender Address of token spender.
    /// @return remaining allowance for spender.
    function allowance(address _owner, address _spender) public view returns (uint256) {
        return allowed[_owner][_spender];
    }

    /// @dev Returns number of tokens owned by given address.
    /// @param _owner Address of token owner.
    /// @return  balance of owner.
    function balanceOf(address _owner) public view returns (uint256) {
        return balances[_owner];
    }
}
