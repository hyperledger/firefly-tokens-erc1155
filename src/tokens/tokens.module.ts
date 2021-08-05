import { HttpModule, Module } from '@nestjs/common';
import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
    }),
  ],
  controllers: [TokensController],
  providers: [TokensService],
})
export class TokensModule {}
