import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsInt, IsNotEmpty, Min, NotContains } from 'class-validator';

// Ethconnect interfaces
export interface EthConnectAsyncResponse {
  sent: boolean;
  id: string;
}

export interface EthConnectReturn {
  output: string;
}
export interface UriEventData {
  id: string;
  value: string;
}

export interface TransferSingleEventData {
  from: string;
  to: string;
  operator: string;
  id: string;
  value: number;
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
  @NotContains('/')
  namespace: string;

  @ApiProperty()
  @IsNotEmpty()
  @NotContains('/')
  name: string;

  @ApiProperty()
  @IsNotEmpty()
  @NotContains('/')
  client_id: string;
}

export class TokenMint {
  @ApiProperty()
  @IsNotEmpty()
  pool_id: string;

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
  pool_id: string;

  @ApiProperty()
  @IsNotEmpty()
  token_index: string;

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
  pool_id: string;

  @ApiProperty()
  @IsNotEmpty()
  token_index: string;

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

export class TokenPoolEvent {
  @ApiProperty()
  pool_id: string;

  @ApiProperty()
  type: TokenType;

  @ApiProperty()
  namespace: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  client_id: string;
}

export class TokenMintEvent {
  @ApiProperty()
  pool_id: string;

  @ApiProperty()
  token_index: string;

  @ApiProperty()
  to: string;

  @ApiProperty()
  amount: number;
}

export class TokenTransferEvent {
  @ApiProperty()
  pool_id: string;

  @ApiProperty()
  token_index: string;

  @ApiProperty()
  from: string;

  @ApiProperty()
  to: string;

  @ApiProperty()
  amount: number;
}

export class ReceiptEvent {
  @ApiProperty()
  id: string;

  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message?: string;
}
