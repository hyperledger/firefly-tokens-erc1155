import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsInt, IsNotEmpty, Min, NotContains } from 'class-validator';

export class EthConnectAsyncResponse {
  @ApiProperty()
  sent: boolean;

  @ApiProperty()
  id: string;
}

export interface EthConnectReturn {
  output: string;
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
  token_id: string;

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
  token_id: string;

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
