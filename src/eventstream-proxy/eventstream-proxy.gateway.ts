import { Logger } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { Event } from '../event-stream/event-stream.interfaces';
import { EventStreamService } from '../event-stream/event-stream.service';
import { EventStreamProxyBase } from './eventstream-proxy.base';
import {
  TokenPoolCreatedEvent,
  TransferSingleEventData,
  UriEventData,
} from './eventstream-proxy.interfaces';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const uriEventSignature = 'URI(string,uint256)';
const transferSingleEventSignature = 'TransferSingle(address,address,address,uint256,uint256)';

@WebSocketGateway({ path: '/api/ws' })
export class EventStreamProxyGateway extends EventStreamProxyBase {
  constructor(protected eventStream: EventStreamService) {
    super(new Logger(EventStreamProxyGateway.name), eventStream, false);
  }

  private splitUri(uri: string) {
    const parts = new URL(uri).pathname.split('/');
    return {
      namespace: parts[1],
      name: parts[2],
      id: parts[3],
    };
  }

  protected handleEvent(event: Event) {
    switch (event.signature) {
      case uriEventSignature:
        this.handlUriEvent(event.data);
        break;
      case transferSingleEventSignature:
        this.handleTransferSingleEvent(event.data);
        break;
      default:
        this.logger.error(`Unknown event signature: ${event.signature}`);
        break;
    }
  }

  private handlUriEvent(data: UriEventData) {
    const response: TokenPoolCreatedEvent = this.splitUri(data.value);
    this.broadcast('token-pool-created', response);
  }

  private handleTransferSingleEvent(data: TransferSingleEventData) {
    if (data.from === ZERO_ADDRESS && data.to === ZERO_ADDRESS) {
      // create pool (handled by URI event)
    } else if (data.from === ZERO_ADDRESS) {
      // mint
    } else if (data.to === ZERO_ADDRESS) {
      // burn
    } else {
      // transfer
    }
  }
}
