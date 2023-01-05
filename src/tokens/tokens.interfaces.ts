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
import { Equals, IsDefined, IsNotEmpty, IsOptional } from 'class-validator';
import { Event } from '../event-stream/event-stream.interfaces';

// Internal types

export interface PoolLocator {
  poolId: string;
  blockNumber?: string;
  address?: string;
}

// Ethconnect interfaces

export interface EthConnectAsyncResponse {
  sent: boolean;
  id: string;
}

export interface EthConnectReturn {
  output: any;
}

export interface ContractInfoResponse {
  address: string;
}

export interface TokenPoolCreationEvent extends Event {
  data: {
    operator: string;
    type_id: string;
    data: string;
  };
}

export interface ApprovalForAllEvent extends Event {
  data: {
    account: string;
    operator: string;
    approved: boolean;
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

export interface TransferBatchEvent extends Event {
  data: {
    from: string;
    to: string;
    operator: string;
    ids: string[];
    values: string[];
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

export enum InterfaceFormat {
  ABI = 'abi',
  FFI = 'ffi',
}

const requestIdDescription =
  'Optional ID to identify this request. Must be unique for every request. ' +
  'If none is provided, one will be assigned and returned in the 202 response.';
const poolConfigDescription =
  'Optional configuration info for the token pool. Reserved for future use.';
const approvalConfigDescription =
  'Optional configuration info for the token approval. Reserved for future use.';
const transferConfigDescription =
  'Optional configuration info for the token transfer. Reserved for future use.';

export class TokenPoolConfig {
  @ApiProperty()
  @IsOptional()
  address?: string;

  @ApiProperty()
  @IsOptional()
  blockNumber?: string;
}

export class TokenPool {
  @ApiProperty({ enum: TokenType })
  @IsDefined()
  type: TokenType;

  @ApiProperty()
  @IsNotEmpty()
  signer: string;

  @ApiProperty({ description: requestIdDescription })
  @IsOptional()
  requestId?: string;

  @ApiProperty()
  @IsOptional()
  data?: string;

  @ApiProperty({ description: poolConfigDescription })
  @IsOptional()
  config?: TokenPoolConfig;
}

export class BlockchainInfo {
  @ApiProperty()
  @IsNotEmpty()
  blockNumber: string;

  @ApiProperty()
  transactionIndex: string;

  @ApiProperty()
  transactionHash: string;

  @ApiProperty()
  logIndex: string;

  @ApiProperty()
  signature: string;

  @ApiProperty()
  address: string;
}

export class BlockchainEvent {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  output: any;

  @ApiProperty()
  info: BlockchainInfo;

  @ApiProperty()
  location: string;

  @ApiProperty()
  signature: string;

  @ApiProperty()
  timestamp: string;
}

export class TokenPoolActivate {
  @ApiProperty()
  @IsNotEmpty()
  poolLocator: string;

  @ApiProperty()
  @IsOptional()
  config?: any;

  @ApiProperty({ description: requestIdDescription })
  @IsOptional()
  requestId?: string;

  @ApiProperty()
  @IsOptional()
  poolData?: string;
}

export class TokenBalanceQuery {
  @ApiProperty()
  @IsNotEmpty()
  poolLocator: string;

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

export class TokenInterface {
  @ApiProperty({ enum: InterfaceFormat })
  @Equals(InterfaceFormat.ABI)
  format: InterfaceFormat;

  @ApiProperty({ isArray: true })
  @IsDefined()
  methods: IAbiMethod[];
}

export class CheckInterfaceRequest extends TokenInterface {
  @ApiProperty()
  @IsNotEmpty()
  poolLocator: string;
}

type TokenAbi = {
  [op in TokenOperation]: TokenInterface;
};

export class CheckInterfaceResponse implements TokenAbi {
  @ApiProperty()
  approval: TokenInterface;

  @ApiProperty()
  burn: TokenInterface;

  @ApiProperty()
  mint: TokenInterface;

  @ApiProperty()
  transfer: TokenInterface;
}

export class TokenTransfer {
  @ApiProperty()
  @IsNotEmpty()
  poolLocator: string;

  @ApiProperty()
  @IsOptional()
  tokenIndex?: string;

  @ApiProperty()
  @IsNotEmpty()
  signer: string;

  @ApiProperty()
  @IsNotEmpty()
  from: string;

  @ApiProperty()
  @IsNotEmpty()
  to: string;

  @ApiProperty()
  @IsNotEmpty()
  amount: string;

  @ApiProperty({ description: requestIdDescription })
  @IsOptional()
  requestId?: string;

  @ApiProperty()
  @IsOptional()
  data?: string;

  @ApiProperty({ description: transferConfigDescription })
  @IsOptional()
  config?: any;

  @ApiProperty()
  @IsOptional()
  interface?: TokenInterface;
}

export class TokenMint extends OmitType(TokenTransfer, ['tokenIndex', 'from']) {
  @ApiProperty()
  @IsOptional()
  uri?: string;
}
export class TokenBurn extends OmitType(TokenTransfer, ['to']) {}

export class TokenApproval {
  @ApiProperty()
  @IsNotEmpty()
  poolLocator: string;

  @ApiProperty()
  @IsNotEmpty()
  signer: string;

  @ApiProperty()
  @IsNotEmpty()
  operator: string;

  @ApiProperty()
  @IsNotEmpty()
  approved: boolean;

  @ApiProperty({ description: requestIdDescription })
  @IsOptional()
  requestId?: string;

  @ApiProperty()
  @IsOptional()
  data?: string;

  @ApiProperty({ description: approvalConfigDescription })
  @IsOptional()
  config?: any;

  @ApiProperty()
  @IsOptional()
  interface?: TokenInterface;
}

// Websocket notifications

class tokenEventBase {
  @ApiProperty()
  poolLocator: string;

  @ApiProperty()
  signer: string;

  @ApiProperty()
  @IsOptional()
  data?: string;

  @ApiProperty()
  blockchain: BlockchainEvent;
}

export class TokenPoolEventInfo {
  @ApiProperty()
  address: string;

  @ApiProperty()
  typeId: string;
}

export class TokenPoolEvent extends tokenEventBase {
  @ApiProperty()
  type: TokenType;

  @ApiProperty()
  standard: string;

  @ApiProperty()
  interfaceFormat: InterfaceFormat;

  @ApiProperty()
  @IsOptional()
  symbol?: string;

  @ApiProperty()
  info: TokenPoolEventInfo;
}

export class TokenTransferEvent extends tokenEventBase {
  @ApiProperty()
  id: string;

  @ApiProperty()
  @IsOptional()
  tokenIndex?: string;

  @ApiProperty()
  @IsOptional()
  uri?: string;

  @ApiProperty()
  from: string;

  @ApiProperty()
  to: string;

  @ApiProperty()
  amount: string;

  @ApiProperty()
  poolData?: string;
}

export class TokenMintEvent extends OmitType(TokenTransferEvent, ['from']) {}
export class TokenBurnEvent extends OmitType(TokenTransferEvent, ['to']) {}

export class TokenApprovalEvent extends tokenEventBase {
  @ApiProperty()
  id: string;

  @ApiProperty()
  subject: string;

  @ApiProperty()
  operator: string;

  @ApiProperty()
  approved: boolean;

  @ApiProperty()
  poolData?: string;
}

// ABI format

export interface IAbiInput {
  indexed?: boolean;
  internalType: string;
  name: string;
  type: string;
}

export interface IAbiMethod {
  anonymous?: boolean;
  inputs?: IAbiInput[];
  outputs?: any[];
  stateMutability?: string;
  name?: string;
  type?: string;
}

export interface EthConnectMsgRequest {
  headers: {
    type: string;
  };
  from?: string;
  to: string;
  method: IAbiMethod;
  params: any[];
}

export interface MethodSignature {
  name: string;
  inputs: { type: string }[];
  map: (poolLocator: PoolLocator, dto: any) => any[] | undefined;
}

export type TokenOperation = 'approval' | 'burn' | 'mint' | 'transfer';
