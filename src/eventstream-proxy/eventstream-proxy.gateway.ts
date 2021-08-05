import { Logger } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { TokenType } from '../tokens/tokens.interfaces';
import { Event } from '../event-stream/event-stream.interfaces';
import { EventStreamService } from '../event-stream/event-stream.service';
import { unpackTokenId, unpackTokenUri } from '../util';
import { EventStreamProxyBase } from './eventstream-proxy.base';
import {
  TokenMintEvent,
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
        this.socket?.ack();
        break;
    }
  }

  private handlUriEvent(data: UriEventData) {
    const parts = unpackTokenId(data.id);
    this.broadcast('token-pool-created', <TokenPoolCreatedEvent>{
      ...unpackTokenUri(data.value),
      pool_id: parts.pool_id,
      type: parts.is_fungible ? TokenType.FUNGIBLE : TokenType.NONFUNGIBLE,
    });
  }

  private handleTransferSingleEvent(data: TransferSingleEventData) {
    if (data.from === ZERO_ADDRESS && data.to === ZERO_ADDRESS) {
      // create pool (handled by URI event)
      this.socket?.ack();
    } else if (data.from === ZERO_ADDRESS) {
      // mint
      const parts = unpackTokenId(data.id);
      this.broadcast('token-mint', <TokenMintEvent>{
        pool_id: parts.pool_id,
        token_id: parts.token_id,
        to: data.to,
        amount: data.value,
      });
    } else if (data.to === ZERO_ADDRESS) {
      // burn
      this.socket?.ack();
    } else {
      // transfer
      this.socket?.ack();
    }
  }
}
