// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Context.sol";

/**
    @dev Mintable+burnable form of ERC1155 with mixed fungible/non-fungible item support.
    Based on reference implementation:
    https://github.com/enjin/erc-1155/blob/master/contracts/ERC1155MixedFungibleMintable.sol
*/
contract ERC1155MixedFungible is Context, ERC1155 {
    // Use a split bit implementation:
    //   - Bit 255: type flag (0 = fungible, 1 = non-fungible)
    //   - Bits 254-128: type id
    //   - Bits 127-0: token index (non-fungible only)
    uint256 constant TYPE_MASK = uint256(uint128(~0)) << 128;
    uint256 constant NF_INDEX_MASK = uint128(~0);
    uint256 constant TYPE_NF_BIT = 1 << 255;

    uint256 nonce;
    mapping (uint256 => address) public creators;
    mapping (uint256 => uint256) public maxIndex;

    event TokenCreate(address indexed operator, uint256 indexed type_id, bytes data);

    function isFungible(uint256 id) internal pure returns(bool) {
        return id & TYPE_NF_BIT == 0;
    }
    function isNonFungible(uint256 id) internal pure returns(bool) {
        return id & TYPE_NF_BIT == TYPE_NF_BIT;
    }

    // Only the creator of a token type is allowed to mint it.
    modifier creatorOnly(uint256 type_id) {
        require(creators[type_id] == _msgSender());
        _;
    }

    constructor(string memory uri) ERC1155(uri) public {
    }

    function create(bool is_fungible, bytes calldata data)
        external
        virtual
        returns(uint256 type_id)
    {
        type_id = (++nonce << 128);
        if (!is_fungible)
          type_id = type_id | TYPE_NF_BIT;

        creators[type_id] = _msgSender();

        emit TokenCreate(_msgSender(), type_id, data);
    }

    function mintNonFungible(uint256 type_id, address[] calldata to, bytes calldata data)
        external
        virtual
        creatorOnly(type_id)
    {
        require(isNonFungible(type_id), "ERC1155MixedFungible: id does not represent a non-fungible type");

        // Indexes are 1-based.
        uint256 index = maxIndex[type_id] + 1;
        maxIndex[type_id] = to.length.add(maxIndex[type_id]);

        for (uint256 i = 0; i < to.length; ++i) {
            _mint(to[i], type_id | index + i, 1, data);
        }
    }

    function mintFungible(uint256 type_id, address[] calldata to, uint256[] calldata amounts, bytes calldata data)
        external
        virtual
        creatorOnly(type_id)
    {
        require(isFungible(type_id), "ERC1155MixedFungible: id does not represent a fungible type");
        require(to.length == amounts.length, "ERC1155MixedFungible: to and amounts length mismatch");

        for (uint256 i = 0; i < to.length; ++i) {
            _mint(to[i], type_id, amounts[i], data);
        }
    }

    // Reference:
    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC1155/extensions/ERC1155Burnable.sol
    function burn(address from, uint256 id, uint256 amount, bytes calldata data)
        external
        virtual
    {
        require(
            from == _msgSender() || isApprovedForAll(from, _msgSender()),
            "ERC1155MixedFungible: caller is not owner nor approved"
        );

        _burn(from, id, amount);
    }
}
