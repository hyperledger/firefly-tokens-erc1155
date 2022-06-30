// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import './IERC1155MixedFungible.sol';

/**
 * Test utility for checking ERC165 interface identifiers.
 */
contract InterfaceCheck {
    function erc1155WithUri() external view returns (bytes4) {
        return type(IERC1155MixedFungible).interfaceId;
    }
}
