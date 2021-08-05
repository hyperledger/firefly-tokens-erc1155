import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsNotEmpty, IsUUID } from 'class-validator';

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
  namespace: string;

  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsNotEmpty()
  name: string;
}
