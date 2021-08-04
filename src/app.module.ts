import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TokensModule } from './tokens/tokens.module';

@Module({
  imports: [TokensModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
