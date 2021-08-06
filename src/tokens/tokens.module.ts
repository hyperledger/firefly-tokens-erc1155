import { HttpModule, Module } from '@nestjs/common';
import { EventStreamProxyModule } from '../eventstream-proxy/eventstream-proxy.module';
import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
    }),
    EventStreamProxyModule,
  ],
  controllers: [TokensController],
  providers: [TokensService],
})
export class TokensModule {}
