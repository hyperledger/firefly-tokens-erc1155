import { Logger } from '@nestjs/common';
import { SubscribeMessage } from '@nestjs/websockets';
import { Event } from '../event-stream/event-stream.interfaces';
import { EventStreamService, EventStreamSocket } from '../event-stream/event-stream.service';
import { WebSocketEventsBase, WebSocketEx } from '../websocket-events/websocket-events.base';

/**
 * Base class for a websocket gateway that listens for and proxies event stream messages.
 *
 * To create the actual gateway, subclass and decorate your child, e.g.:
 * @WebSocketGateway({ path: '/api/stream' })
 */
export abstract class EventStreamProxyBase extends WebSocketEventsBase {
  socket?: EventStreamSocket;
  url?: string;
  topic?: string;

  constructor(
    protected readonly logger: Logger,
    protected eventstream: EventStreamService,
    requireAuth = false,
  ) {
    super(logger, requireAuth);
  }

  configure(url?: string, topic?: string) {
    this.url = url;
    this.topic = topic;
  }

  handleConnection(client: WebSocketEx) {
    super.handleConnection(client);
    if (this.server.clients.size === 1 && this.url !== undefined && this.topic !== undefined) {
      this.logger.log(`Initializing event stream proxy`);
      this.socket = this.eventstream.subscribe(this.url, this.topic, (event: Event) => {
        this.logger.log(`Proxying event: ${JSON.stringify(event)}`);
        this.handleEvent(event);
      });
    }
  }

  handleDisconnect(client: WebSocketEx) {
    super.handleDisconnect(client);
    if (this.server.clients.size === 0) {
      this.socket?.close();
      this.socket = undefined;
    }
  }

  protected handleEvent(_event: Event) {
    // do nothing (can be overridden)
  }

  @SubscribeMessage('ack')
  handleAck() {
    this.logger.log('Received ack');
    this.socket?.ack();
  }
}
