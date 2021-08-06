import { HttpService, Injectable, Logger } from '@nestjs/common';
import { EventListener } from '../eventstream-proxy/eventstream-proxy.interfaces';
import { EventStreamProxyGateway } from '../eventstream-proxy/eventstream-proxy.gateway';
import { isFungible, packTokenId, packTokenUri, unpackTokenId, unpackTokenUri } from '../util';
import { Event, EventStreamReply } from '../event-stream/event-stream.interfaces';
import {
  AsyncResponse,
  EthConnectAsyncResponse,
  EthConnectReturn,
  ReceiptEvent,
  TokenBalance,
  TokenBalanceQuery,
  TokenMint,
  TokenMintEvent,
  TokenPool,
  TokenPoolEvent,
  TokenTransfer,
  TokenTransferEvent,
  TokenType,
  TransferSingleEventData,
  UriEventData,
} from './tokens.interfaces';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const uriEventSignature = 'URI(string,uint256)';
const transferSingleEventSignature = 'TransferSingle(address,address,address,uint256,uint256)';

@Injectable()
export class TokensService {
  baseUrl: string;
  instanceUrl: string;
  identity: string;
  listener: TokenListener;

  constructor(private http: HttpService, proxy: EventStreamProxyGateway) {
    this.listener = new TokenListener(proxy);
    proxy.addListener(this.listener);
  }

  configure(baseUrl: string, instanceUrl: string, identity: string) {
    this.baseUrl = baseUrl;
    this.instanceUrl = instanceUrl;
    this.identity = identity;
  }

  private get postOptions() {
    return {
      params: {
        'fly-from': this.identity,
        'fly-sync': 'false',
      },
    };
  }

  async getReceipt(id: string): Promise<EventStreamReply> {
    const response = await this.http
      .get<EventStreamReply>(`${this.baseUrl}/reply/${id}`)
      .toPromise();
    return response.data;
  }

  async createPool(dto: TokenPool): Promise<AsyncResponse> {
    const response = await this.http
      .post<EthConnectAsyncResponse>(
        `${this.instanceUrl}/create`,
        {
          uri: packTokenUri(dto.namespace, dto.name, dto.client_id),
          is_fungible: dto.type === TokenType.FUNGIBLE,
        },
        this.postOptions,
      )
      .toPromise();
    return { id: response.data.id };
  }

  async mint(dto: TokenMint): Promise<AsyncResponse> {
    const type_id = packTokenId(dto.pool_id);
    if (isFungible(dto.pool_id)) {
      const response = await this.http
        .post<EthConnectAsyncResponse>(
          `${this.instanceUrl}/mintFungible`,
          {
            type_id,
            to: [dto.to],
            amounts: [dto.amount],
            data: [0],
          },
          this.postOptions,
        )
        .toPromise();
      return { id: response.data.id };
    } else {
      const to: string[] = [];
      for (let i = 0; i < dto.amount; i++) {
        to.push(dto.to);
      }

      const response = await this.http
        .post<EthConnectAsyncResponse>(
          `${this.instanceUrl}/mintNonFungible`,
          {
            type_id,
            to,
            data: [0],
          },
          this.postOptions,
        )
        .toPromise();
      return { id: response.data.id };
    }
  }

  async balance(dto: TokenBalanceQuery): Promise<TokenBalance> {
    const response = await this.http
      .get<EthConnectReturn>(`${this.instanceUrl}/balanceOf`, {
        params: {
          account: dto.account,
          id: packTokenId(dto.pool_id, dto.token_index),
        },
      })
      .toPromise();
    return { balance: parseInt(response.data.output) };
  }

  async transfer(dto: TokenTransfer): Promise<AsyncResponse> {
    const response = await this.http
      .post<EthConnectAsyncResponse>(
        `${this.instanceUrl}/safeTransferFrom`,
        {
          from: dto.from,
          to: dto.to,
          id: packTokenId(dto.pool_id, dto.token_index),
          amount: dto.amount,
          data: [0],
        },
        this.postOptions,
      )
      .toPromise();
    return { id: response.data.id };
  }
}

class TokenListener implements EventListener {
  private readonly logger = new Logger(TokenListener.name);

  constructor(private proxy: EventStreamProxyGateway) {}

  handleEvent(event: Event) {
    switch (event.signature) {
      case uriEventSignature:
        this.handleUriEvent(event.data);
        break;
      case transferSingleEventSignature:
        this.handleTransferSingleEvent(event.data);
        break;
      default:
        this.logger.error(`Unknown event signature: ${event.signature}`);
        this.ack();
        break;
    }
  }

  handleReceipt(receipt: EventStreamReply) {
    this.broadcast('receipt', <ReceiptEvent>{
      id: receipt.headers.requestId,
      success: receipt.headers.type === 'TransactionSuccess',
      message: receipt.errorMessage,
    });
  }

  private ack() {
    this.proxy.ack();
  }

  private broadcast(event: string, data: any = null) {
    this.proxy.broadcast(event, data);
  }

  private handleUriEvent(data: UriEventData) {
    const parts = unpackTokenId(data.id);
    this.broadcast('token-pool', <TokenPoolEvent>{
      ...unpackTokenUri(data.value),
      pool_id: parts.pool_id,
      type: parts.is_fungible ? TokenType.FUNGIBLE : TokenType.NONFUNGIBLE,
    });
  }

  private handleTransferSingleEvent(data: TransferSingleEventData) {
    if (data.from === ZERO_ADDRESS && data.to === ZERO_ADDRESS) {
      // create pool (handled by URI event)
      this.ack();
    } else if (data.from === ZERO_ADDRESS) {
      // mint
      const parts = unpackTokenId(data.id);
      this.broadcast('token-mint', <TokenMintEvent>{
        pool_id: parts.pool_id,
        token_index: parts.token_index,
        to: data.to,
        amount: data.value,
      });
    } else if (data.to === ZERO_ADDRESS) {
      // burn
      this.ack();
    } else {
      // transfer
      const parts = unpackTokenId(data.id);
      this.broadcast('token-transfer', <TokenTransferEvent>{
        pool_id: parts.pool_id,
        token_index: parts.token_index,
        from: data.from,
        to: data.to,
        amount: data.value,
      });
    }
  }
}
