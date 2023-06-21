// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/utils/introspection/IERC165.sol';

/**
 * ERC1155 interface that supports creating partitions of fungible and non-fungible tokens.
 * The implementation may decide how to allocate these "pools" of value, and should emit the
 * TokenPoolCreation event to advertise each newly created partition (with start_id and end_id
 * being the inclusive start and end indexes of the ERC1155 id space).
 */
interface IERC1155Factory is IERC165 {
    event TokenPoolCreation(
        address indexed operator,
        bool indexed is_fungible,
        uint256 start_id,
        uint256 end_id,
        bytes data
    );

    function create(bool is_fungible, bytes calldata data) external;
}
