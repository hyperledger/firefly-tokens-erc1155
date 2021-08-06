import { HttpService, Injectable } from '@nestjs/common';
import { EventStreamReply } from '../event-stream/event-stream.interfaces';
import { isFungible, packTokenId, packTokenUri } from '../util';
import {
  AsyncResponse,
  EthConnectAsyncResponse,
  EthConnectReturn,
  TokenBalance,
  TokenBalanceQuery,
  TokenMint,
  TokenPool,
  TokenTransfer,
  TokenType,
} from './tokens.interfaces';

@Injectable()
export class TokensService {
  baseUrl: string;
  instanceUrl: string;
  identity: string;

  constructor(private http: HttpService) {}

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
          id: packTokenId(dto.pool_id, dto.token_id),
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
          id: packTokenId(dto.pool_id, dto.token_id),
          amount: dto.amount,
          data: [0],
        },
        this.postOptions,
      )
      .toPromise();
    return { id: response.data.id };
  }
}
