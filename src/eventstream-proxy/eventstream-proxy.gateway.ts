import { Logger } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { Event } from '../event-stream/event-stream.interfaces';
import { EventStreamService } from '../event-stream/event-stream.service';
import { EventStreamProxyBase } from './eventstream-proxy.base';

@WebSocketGateway({ path: '/api/ws' })
export class EventStreamProxyGateway extends EventStreamProxyBase {
  constructor(protected eventStream: EventStreamService) {
    super(new Logger(EventStreamProxyGateway.name), eventStream, false);
  }

  protected handleEvent(_event: Event) {
    // do nothing
  }
}
