import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EthConnectAsyncResponse, TokenPool } from './tokens.interfaces';
import { TokensService } from './tokens.service';

@Controller('tokens')
export class TokensController {
  constructor(private readonly service: TokensService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'Create a new token pool' })
  @ApiBody({ type: TokenPool })
  @ApiResponse({ status: 202, type: EthConnectAsyncResponse })
  createPool(@Body() dto: TokenPool) {
    return this.service.createPool(dto);
  }
}
