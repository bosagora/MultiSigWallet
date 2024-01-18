// SPDX-License-Identifier: LGPL-3.0

pragma solidity ^0.8.2;

contract Factory {
    /*
     *  Events
     */
    event ContractInstantiation(address sender, address instantiation);

    /*
     *  Storage
     */
    mapping(address => bool) public isInstantiation;
    mapping(address => address[]) public instantiations;

    /*
     * Public functions
     */
    /// @dev Returns number of instantiations by creator.
    /// @param _creator Contract creator.
    /// @return number of instantiations by creator.
    function getInstantiationCount(address _creator) public view returns (uint256) {
        return instantiations[_creator].length;
    }

    /*
     * Internal functions
     */
    /// @dev Registers contract in factory registry.
    /// @param _instantiation Address of contract instantiation.
    function register(address _instantiation) internal {
        isInstantiation[_instantiation] = true;
        instantiations[msg.sender].push(_instantiation);
        emit ContractInstantiation(msg.sender, _instantiation);
    }
}
