# FireFly Tokens Microservice for ERC1155

This project provides a thin shim between [FireFly](https://github.com/hyperledger-labs/firefly)
and an ERC1155 contract exposed via [ethconnect](https://github.com/hyperledger-labs/firefly-ethconnect).

Based on [Node.js](http://nodejs.org) and [Nest](http://nestjs.com).

This service is entirely stateless - it maps incoming REST operations directly to ethconnect
calls, and maps ethconnect events to outgoing websocket events.

## API Overview

APIs all reside under `/api/v1`, and websocket notifications can be received by
connecting to `/api/ws`.

* `POST /pool` - Create a new token pool (inputs: type, data)
* `POST /mint` - Mint new tokens (inputs: poolId, to, amount, data)
* `POST /transfer` - Transfer tokens (inputs: poolId, tokenIndex, from, to, amount, data)
* `GET /balance` - Get token balance (inputs: poolId, tokenIndex, account)

All POST APIs are async and return 202 immediately with a response of the form
`{id: string}`. When the operation finishes, the result will be reported on the
websocket with the event:
`{event: "receipt", data: {id: string, success: bool, message?: string}}`.
This event is sent to all connected websocket clients and is informative only (does
not require any acknowledgment). Receipts can also be manually queried from the
`GET /receipt/:id` API.

Successful operations will also result in a more detailed event of the form
`{event: string, id: string, data: any}`, with the following event types:

* `token-pool` - Token pool created (outputs: poolId, operator, type, data)
* `token-mint` - Tokens minted (outputs: poolId, tokenIndex, operator, to, amount, data)
* `token-transfer` - Tokens transferred (outputs: poolId, tokenIndex, operator, from, to, amount, data)

For these events, if multiple websocket clients are connected, only one will receive them.
Each one _must_ be acknowledged by replying on the websocket with `{event: "ack", data: {id}}`.

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

View the Swagger UI at http://localhost:3000/api<br />
View the generated OpenAPI spec at http://localhost:3000/api-json

## Test

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

## Configuration

Configuration data will be read from the `.env` file by default.
See [.env](.env) for a list of all config values.
