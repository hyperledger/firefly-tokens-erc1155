import { ApiProperty } from '@nestjs/swagger';
import { TokenType } from '../tokens/tokens.interfaces';

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
  token_id: string;

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
