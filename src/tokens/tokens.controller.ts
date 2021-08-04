import { Controller, Get, Post } from '@nestjs/common';
import { TokensService } from './tokens.service';

@Controller('tokens')
export class TokensController {
  constructor(private readonly service: TokensService) {}

  @Get()
  getPools() {
    // TODO: implement
  }

  @Post()
  createPool() {
    // TODO: implement
  }
}
