// Copyright © 2021 Kaleido, Inc.
//
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsInt, IsNotEmpty, Min } from 'class-validator';
import { Event } from '../event-stream/event-stream.interfaces';

// Ethconnect interfaces
export interface EthConnectAsyncResponse {
  sent: boolean;
  id: string;
}

export interface EthConnectReturn {
  output: string;
}

export interface TokenCreateEvent extends Event {
  data: {
    operator: string;
    type_id: string;
    data: string;
  };
}

export interface TransferSingleEvent extends Event {
  data: {
    from: string;
    to: string;
    operator: string;
    id: string;
    value: number;
  };
}

// REST API requests and responses
export class AsyncResponse {
  @ApiProperty()
  id: string;
}

export enum TokenType {
  FUNGIBLE = 'fungible',
  NONFUNGIBLE = 'nonfungible',
}

export class TokenPool {
  @ApiProperty({ enum: TokenType })
  @IsDefined()
  type: TokenType;

  @ApiProperty()
  @IsNotEmpty()
  namespace: string;

  @ApiProperty()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsNotEmpty()
  clientId: string;
}

export class TokenMint {
  @ApiProperty()
  @IsNotEmpty()
  poolId: string;

  @ApiProperty()
  @IsNotEmpty()
  to: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  amount: number;
}

export class TokenBalanceQuery {
  @ApiProperty()
  @IsNotEmpty()
  poolId: string;

  @ApiProperty()
  @IsNotEmpty()
  tokenIndex: string;

  @ApiProperty()
  @IsNotEmpty()
  account: string;
}

export class TokenBalance {
  @ApiProperty()
  balance: number;
}

export class TokenTransfer {
  @ApiProperty()
  @IsNotEmpty()
  poolId: string;

  @ApiProperty()
  @IsNotEmpty()
  tokenIndex: string;

  @ApiProperty()
  @IsNotEmpty()
  from: string;

  @ApiProperty()
  @IsNotEmpty()
  to: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  amount: number;
}

// Websocket notifications

export class BlockchainTransaction {
  @ApiProperty()
  blockNumber: string;

  @ApiProperty()
  transactionIndex: string;

  @ApiProperty()
  transactionHash: string;
}

export class TokenPoolEvent {
  @ApiProperty()
  poolId: string;

  @ApiProperty()
  type: TokenType;

  @ApiProperty()
  namespace: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  clientId: string;

  @ApiProperty()
  author: string; // TODO: remove

  @ApiProperty()
  operator: string;

  @ApiProperty()
  transaction: BlockchainTransaction;
}

export class TokenMintEvent {
  @ApiProperty()
  poolId: string;

  @ApiProperty()
  tokenIndex: string;

  @ApiProperty()
  to: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  operator: string;

  @ApiProperty()
  transaction: BlockchainTransaction;
}

export class TokenTransferEvent {
  @ApiProperty()
  poolId: string;

  @ApiProperty()
  tokenIndex: string;

  @ApiProperty()
  from: string;

  @ApiProperty()
  to: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  operator: string;

  @ApiProperty()
  transaction: BlockchainTransaction;
}
