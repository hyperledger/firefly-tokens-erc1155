// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.6.0;

import "./ERC1155MixedFungible.sol";

/**
    Deprecated: use ERC1155MixedFungible instead.
    Placeholder to support migration.
*/
contract ERC1155MixedFungibleMintable is ERC1155MixedFungible {
    constructor(string memory uri) ERC1155MixedFungible(uri) public {
    }
}
