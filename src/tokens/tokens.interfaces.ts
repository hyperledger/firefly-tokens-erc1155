import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsInt, IsNotEmpty, Min, NotContains } from 'class-validator';

export class EthConnectAsyncResponse {
  @ApiProperty()
  sent: boolean;

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
