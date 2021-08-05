import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventStreamModule } from '../event-stream/event-stream.module';
import { EventStreamProxyGateway } from './eventstream-proxy.gateway';

@Module({
  imports: [ConfigModule, EventStreamModule],
  providers: [EventStreamProxyGateway],
  exports: [EventStreamProxyGateway],
})
export class EventStreamProxyModule {}
