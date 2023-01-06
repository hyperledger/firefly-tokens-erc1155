# FireFly Tokens Microservice for ERC1155

This project provides a thin shim between [FireFly](https://github.com/hyperledger/firefly)
and an ERC1155 contract exposed via [ethconnect](https://github.com/hyperledger/firefly-ethconnect)
or [evmconnect](https://github.com/hyperledger/firefly-evmconnect).

Based on [Node.js](http://nodejs.org) and [Nest](http://nestjs.com).

This service is entirely stateless - it maps incoming REST operations directly to blockchain
calls, and maps blockchain events to outgoing websocket events.

## Smart Contracts

This connector is designed to interact with ERC1155 smart contracts on an Ethereum
blockchain which conform to a specific pattern. The repository includes a sample
[Solidity contract](samples/solidity/) that may be used to get up and running with
simple token support, and may provide a starting point for developing
production contracts that can be used with this connector.

To be usable by this connector, an ERC1155 contract should do all of the following:
1. Conform to [IERC1155MixedFungible](samples/solidity/contracts/IERC1155MixedFungible.sol).
2. Group tokens into clear fungible and non-fungible pools by partitioning the token ID space via the split bit implementation detailed in the comments in [ERC1155MixedFungible](samples/solidity/contracts/ERC1155MixedFungible.sol).

This connector may also be used as a starting point to build a custom connector
that interacts with ERC1155 contracts conforming to some other pattern.

### FireFly Interface Parsing

The most flexible and robust token functionality is achieved by teaching FireFly about your token
contract, then allowing it to teach the token connector. This is optional in the sense that there
are additional methods used by the token connector to guess at the contract ABI (detailed later),
but is the preferred method for most use cases.

To leverage this capability in a running FireFly environment, you must:
1. [Upload the token contract ABI to FireFly](https://hyperledger.github.io/firefly/tutorials/custom_contracts/ethereum.html)
as a contract interface.
2. Include the `interface` parameter when [creating the pool on FireFly](https://hyperledger.github.io/firefly/tutorials/tokens).

This will cause FireFly to parse the interface and provide ABI details
to this connector, so it can determine the best methods from the ABI to be used for each operation.
When this procedure is followed, the connector can find and call any variant of mint/burn/transfer/approval
that is listed in the source code for [erc1155.ts](src/tokens/erc1155.ts).
Due to strong assumptions in the source code, these are mostly the signatures from
[IERC1155MixedFungible](samples/solidity/contracts/IERC1155MixedFungible.sol), with a few other
variants for some methods from the [OpenZeppelin Wizard](https://wizard.openzeppelin.com).

### Solidity Interface Support

In the absence of being provided with ABI details, the token connector will attempt to guess the contract
ABI in use. It does this by using ERC165 `supportsInterface()` to query the contract's support for
`IERC1155MixedFungible`, as defined in this repository. If the query succeeds, the connector will leverage
the methods on that interface to perform token operations. Therefore it is possible to use these
contracts without the extra step of teaching FireFly about the contract interface first.

## API Extensions

The APIs of this connector conform to the FireFly fftokens standard, and are designed to be called by
FireFly. They should generally not be called directly by anything other than FireFly.

Below are some of the specific considerations and extra requirements enforced by this connector on
top of the fftokens standard.

### `/createpool`

If `config.address` is specified, the connector will invoke the `create()` method of the ERC1155 token
contract at the specified address.

If `config.address` is not specified, and `CONTRACT_ADDRESS` is set in the connector's
environment, the `create()` method of that contract will be invoked.

Any `name` and `symbol` provided from FireFly are ignored by this connector.

### `/mint`

For fungible token pools, `tokenIndex` and `uri` will be ignored.

For non-fungible token pools, `tokenIndex` will be ignored, as an index will be auto-generated.
`amount` may be any integer that can be represented by a JavaScript `number`, and will cause that
amount of unique tokens to be minted.

### `/burn`

For non-fungible token pools, `tokenIndex` is required, and `amount` must be 1.

### `/transfer`

For non-fungible token pools, `tokenIndex` is required, and `amount` must be 1.

### `/approval`

All approvals are global and will apply to all tokens across _all_ pools on a particular ERC1155 contract.

## Extra APIs

The following APIs are not part of the fftokens standard, but are exposed under `/api/v1`:

* `GET /balance` - Get token balance
* `GET /receipt/:id` - Get receipt for a previous request

## Running the service

The easiest way to run this service is as part of a stack created via
[firefly-cli](https://github.com/hyperledger/firefly-cli).

To run manually, you first need to run an Ethereum blockchain node and an instance of
[firefly-ethconnect](https://github.com/hyperledger/firefly-ethconnect), and deploy the
[ERC1155 smart contract](solidity/contracts/ERC1155MixedFungible.sol).

Then, adjust your configuration to point at the deployed contract by editing [.env](.env)
or by setting the environment values directly in your shell.

Install and run the application using npm:

```bash
# install
$ npm install

# run in development mode
$ npm run start

# run in watch mode
$ npm run start:dev

# run in production mode
$ npm run start:prod
```

View the Swagger UI at http://localhost:3000/api<br />
View the generated OpenAPI spec at http://localhost:3000/api-json

## Testing

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# lint
$ npm run lint

# formatting
$ npm run format
```
