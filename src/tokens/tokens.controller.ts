import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EthConnectAsyncResponse, TokenMint, TokenPool } from './tokens.interfaces';
import { TokensService } from './tokens.service';

@Controller()
export class TokensController {
  constructor(private readonly service: TokensService) {}

  @Post('pool')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Create a new token pool',
    description:
      'Will be followed by a websocket notification with event=token-pool and data=TokenPoolEvent',
  })
  @ApiBody({ type: TokenPool })
  @ApiResponse({ status: 202, type: EthConnectAsyncResponse })
  createPool(@Body() dto: TokenPool) {
    return this.service.createPool(dto);
  }

  @Post('mint')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Mint new tokens',
    description:
      'Will be followed by a websocket notification with event=token-mint and data=TokenMintEvent',
  })
  @ApiBody({ type: TokenMint })
  @ApiResponse({ status: 202, type: EthConnectAsyncResponse })
  mint(@Body() dto: TokenMint) {
    return this.service.mint(dto);
  }
}
