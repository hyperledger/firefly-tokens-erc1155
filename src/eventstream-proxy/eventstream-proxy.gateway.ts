import { Logger } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { Event, EventStreamReply } from '../event-stream/event-stream.interfaces';
import { EventStreamService } from '../event-stream/event-stream.service';
import { EventStreamProxyBase } from './eventstream-proxy.base';
import { EventListener } from './eventstream-proxy.interfaces';

@WebSocketGateway({ path: '/api/ws' })
export class EventStreamProxyGateway extends EventStreamProxyBase {
  listeners: EventListener[] = [];

  constructor(protected eventStream: EventStreamService) {
    super(new Logger(EventStreamProxyGateway.name), eventStream, false);
  }

  addListener(listener: EventListener) {
    this.listeners.push(listener);
  }

  protected handleEvent(event: Event) {
    for (const listener of this.listeners) {
      listener.handleEvent(event);
    }
  }

  protected handleReceipt(receipt: EventStreamReply) {
    for (const listener of this.listeners) {
      listener.handleReceipt(receipt);
    }
  }
}
