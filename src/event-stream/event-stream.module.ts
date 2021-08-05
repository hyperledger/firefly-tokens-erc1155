import { HttpModule, Module } from '@nestjs/common';
import { EventStreamService } from './event-stream.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
    }),
  ],
  providers: [EventStreamService],
  exports: [EventStreamService],
})
export class EventStreamModule {}
