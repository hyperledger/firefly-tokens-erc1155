// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC1155/extensions/ERC1155URIStorage.sol';
import '@openzeppelin/contracts/utils/Context.sol';
import './IERC1155MixedFungible.sol';

/**
 * Example ERC1155 with mixed fungible/non-fungible token support.
 *
 * Based on original sample here:
 * https://github.com/enjin/erc-1155/blob/master/contracts/ERC1155MixedFungibleMintable.sol
 *
 * Notes on functionality:
 *   - the token space is divided in to "pools", where each pool is fungible or non-fungible
 *   - any party can create a new pool
 *   - the pool creator is the only party allowed to mint within that pool
 *   - any party can approve another party to manage (ie transfer) all of their tokens (across all pools)
 *   - any party can burn their own tokens
 *
 * The inclusion of a "data" argument on each external method allows FireFly to write
 * extra data to the chain alongside each token transaction, in order to correlate it with
 * other on- and off-chain events.
 *
 * This is a sample only and NOT a reference implementation.
 *
 * Remember to always consult best practices from other communities and examples (such as OpenZeppelin)
 * when crafting your token logic, rather than relying on the FireFly community alone. Happy minting!
 */
contract ERC1155MixedFungible is Context, ERC1155URIStorage, IERC1155MixedFungible {
    // Use a split bit implementation:
    //   - Bit 255: type flag (0 = fungible, 1 = non-fungible)
    //   - Bits 255-128: type id
    //   - Bits 127-0: token index (non-fungible only)
    uint256 constant TYPE_MASK = type(uint128).max << 128;
    uint256 constant NF_INDEX_MASK = type(uint128).max;
    uint256 constant TYPE_NF_BIT = 1 << 255;
    uint256 constant NF_POOL_SIZE = 1 << 128;

    uint256 nonce;
    mapping(uint256 => address) public creators;
    mapping(uint256 => uint256) public maxIndex;

    // inherited ERC1155 `_uri` is private, so need our own within this contract
    string private _baseTokenURI;

    function isFungible(uint256 id) internal pure returns (bool) {
        return id & TYPE_NF_BIT == 0;
    }

    function isNonFungible(uint256 id) internal pure returns (bool) {
        return id & TYPE_NF_BIT == TYPE_NF_BIT;
    }

    // Only the creator of a token type is allowed to mint it.
    modifier creatorOnly(uint256 type_id) {
        require(creators[type_id] == _msgSender());
        _;
    }

    constructor(string memory uri) ERC1155(uri) {
        _baseTokenURI = uri;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC1155, IERC165) returns (bool) {
        return
            interfaceId == type(IERC1155MixedFungible).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function create(bool is_fungible, bytes calldata data) external virtual override {
        uint256 type_id = (++nonce << 128);
        if (!is_fungible) type_id = type_id | TYPE_NF_BIT;

        creators[type_id] = _msgSender();

        emit TokenPoolCreation(
            _msgSender(),
            is_fungible,
            type_id,
            is_fungible ? type_id : type_id + NF_POOL_SIZE - 1,
            data
        );
    }

    function mintNonFungible(
        uint256 type_id,
        address[] calldata to,
        bytes calldata data
    ) external virtual override creatorOnly(type_id) {
        require(
            isNonFungible(type_id),
            'ERC1155MixedFungible: id does not represent a non-fungible type'
        );

        // Indexes are 1-based.
        uint256 index = maxIndex[type_id] + 1;
        maxIndex[type_id] = to.length + maxIndex[type_id];

        for (uint256 i = 0; i < to.length; ++i) {
            _mint(to[i], type_id | (index + i), 1, data);
        }
    }

    function mintNonFungibleWithURI(
        uint256 type_id,
        address[] calldata to,
        bytes calldata data,
        string memory _uri
    ) external virtual override creatorOnly(type_id) {
        require(
            isNonFungible(type_id),
            'ERC1155MixedFungible: id does not represent a non-fungible type'
        );

        // Indexes are 1-based.
        uint256 index = maxIndex[type_id] + 1;
        maxIndex[type_id] = to.length + maxIndex[type_id];

        for (uint256 i = 0; i < to.length; ++i) {
            uint256 id = type_id | (index + i);
            _mint(to[i], id, 1, data);
            _setURI(id, _uri);
        }
    }

    function mintFungible(
        uint256 type_id,
        address[] calldata to,
        uint256[] calldata amounts,
        bytes calldata data
    ) external virtual override creatorOnly(type_id) {
        require(isFungible(type_id), 'ERC1155MixedFungible: id does not represent a fungible type');
        require(
            to.length == amounts.length,
            'ERC1155MixedFungible: to and amounts length mismatch'
        );

        for (uint256 i = 0; i < to.length; ++i) {
            _mint(to[i], type_id, amounts[i], data);
        }
    }

    // Reference:
    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC1155/extensions/ERC1155Burnable.sol
    function burn(
        address from,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) external virtual override {
        require(
            from == _msgSender() || isApprovedForAll(from, _msgSender()),
            'ERC1155MixedFungible: caller is not owner nor approved'
        );

        _burn(from, id, amount);
    }

    function setApprovalForAllWithData(
        address operator,
        bool approved,
        bytes calldata data
    ) external virtual override {
        setApprovalForAll(operator, approved);
    }

    function uri(
        uint256 id
    )
        public
        view
        virtual
        override(IERC1155MixedFungible, ERC1155URIStorage)
        returns (string memory)
    {
        return super.uri(id);
    }

    function _setURI(uint256 id, string memory tokenURI) internal virtual override {
        require(
            isNonFungible(id),
            'ERC1155MixedFungible: id does not represent a non-fungible type'
        );
        super._setURI(id, tokenURI);
    }

    function baseTokenUri() public view virtual override returns (string memory) {
        return _baseTokenURI;
    }
}
