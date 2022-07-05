// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/utils/introspection/IERC165.sol';

/**
 * ERC1155 interface with mint, burn, and attached data support for fungible & non-fungible tokens.
 * Non-fungible tokens also have support for custom URI's.
 */
 interface IERC1155MixedFungible is IERC165 {
  function create(
    bool is_fungible,
    bytes calldata data
  ) external returns (uint256);

  function mintNonFungible(
    uint256 type_id,
    address[] calldata to,
    bytes calldata data
  ) external;

  function mintNonFungibleWithURI(
    uint256 type_id,
    address[] calldata to,
    bytes calldata data,
    string memory _uri
  ) external;

  function mintFungible(
    uint256 type_id,
    address[] calldata to,
    uint256[] calldata amounts,
    bytes calldata data
  ) external;

  function burn(
    address from,
    uint256 id,
    uint256 amount,
    bytes calldata data
  ) external;

  function setApprovalForAllWithData(
    address operator,
    bool approved,
    bytes calldata data
  ) external;

  function uri(
    uint256 id
  ) external returns (string memory);

  function baseTokenUri() external returns(string memory);
 }