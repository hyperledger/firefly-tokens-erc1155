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

import { ApiProperty, OmitType } from '@nestjs/swagger';
import { IsDefined, IsNotEmpty, IsOptional } from 'class-validator';
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
    value: string;
  };
}

export interface PackedTokenData {
  trackingId?: string;
  data?: any;
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

const trackingIdDescription =
  'Optional ID provided by the client for correlating related events. This field ' +
  'will not be used or inspected by the server, but will be associated with the ' +
  'transaction and returned in any triggered events.';
const requestIdDescription =
  'Optional ID to identify this request. Must be unique for every request. ' +
  'If none is provided, one will be assigned and returned in the 202 response.';
const poolConfigDescription =
  'Optional configuration info for the token pool. Reserved for future use.';

export class TokenPool {
  @ApiProperty({ enum: TokenType })
  @IsDefined()
  type: TokenType;

  @ApiProperty({ description: trackingIdDescription })
  @IsOptional()
  trackingId?: string;

  @ApiProperty({ description: requestIdDescription })
  @IsOptional()
  requestId?: string;

  @ApiProperty({ description: poolConfigDescription })
  @IsOptional()
  config?: any;

  @ApiProperty()
  @IsOptional()
  data?: string; // TODO: remove
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
  balance: string;
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
  @IsNotEmpty()
  amount: string;

  @ApiProperty({ description: trackingIdDescription })
  @IsOptional()
  trackingId?: string;

  @ApiProperty({ description: requestIdDescription })
  @IsOptional()
  requestId?: string;

  @ApiProperty()
  @IsOptional()
  data?: string;
}

export class TokenMint extends OmitType(TokenTransfer, ['tokenIndex', 'from']) {}
export class TokenBurn extends OmitType(TokenTransfer, ['to']) {}

// Websocket notifications

export class BlockchainTransaction {
  @ApiProperty()
  blockNumber: string;

  @ApiProperty()
  transactionIndex: string;

  @ApiProperty()
  transactionHash: string;
}

class tokenEventBase {
  @ApiProperty()
  poolId: string;

  @ApiProperty()
  type: TokenType;

  @ApiProperty()
  operator: string;

  @ApiProperty()
  trackingId?: string;

  @ApiProperty()
  transaction: BlockchainTransaction;
}

export class TokenPoolEvent extends tokenEventBase {
  @ApiProperty()
  data?: string; // TODO: remove
}

export class TokenTransferEvent extends tokenEventBase {
  @ApiProperty()
  tokenIndex: string;

  @ApiProperty()
  from: string;

  @ApiProperty()
  to: string;

  @ApiProperty()
  amount: string;

  @ApiProperty()
  data?: string;
}

export class TokenMintEvent extends OmitType(TokenTransferEvent, ['from']) {}
export class TokenBurnEvent extends OmitType(TokenTransferEvent, ['to']) {}
