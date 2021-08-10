// Copyright © 2021 Kaleido, Inc.
//
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { HttpService, Injectable, Logger } from '@nestjs/common';
import { WebSocketMessage } from '../websocket-events/websocket-events.base';
import { EventListener } from '../eventstream-proxy/eventstream-proxy.interfaces';
import { EventStreamProxyGateway } from '../eventstream-proxy/eventstream-proxy.gateway';
import { Event, EventStreamReply } from '../event-stream/event-stream.interfaces';
import {
  isFungible,
  packTokenId,
  packTokenUri,
  unpackTokenId,
  unpackTokenUri,
} from './tokens.util';
import {
  AsyncResponse,
  EthConnectAsyncResponse,
  EthConnectReturn,
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
  shortPrefix: string;

  constructor(private http: HttpService, proxy: EventStreamProxyGateway) {
    proxy.addListener(new TokenListener());
  }

  configure(baseUrl: string, instanceUrl: string, identity: string, shortPrefix: string) {
    this.baseUrl = baseUrl;
    this.instanceUrl = instanceUrl;
    this.identity = identity;
    this.shortPrefix = shortPrefix;
  }

  private get postOptions() {
    const from = `${this.shortPrefix}-from`;
    const sync = `${this.shortPrefix}-sync`;
    return {
      params: {
        [from]: this.identity,
        [sync]: 'false',
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

  transformEvent(event: Event): WebSocketMessage | undefined {
    switch (event.signature) {
      case uriEventSignature:
        return this.transformUriEvent(event.data);
      case transferSingleEventSignature:
        return this.transformTransferSingleEvent(event.data);
      default:
        this.logger.error(`Unknown event signature: ${event.signature}`);
        return undefined;
    }
  }

  private transformUriEvent(data: UriEventData): WebSocketMessage {
    const parts = unpackTokenId(data.id);
    return {
      event: 'token-pool',
      data: <TokenPoolEvent>{
        ...unpackTokenUri(data.value),
        pool_id: parts.pool_id,
        type: parts.is_fungible ? TokenType.FUNGIBLE : TokenType.NONFUNGIBLE,
      },
    };
  }

  private transformTransferSingleEvent(
    data: TransferSingleEventData,
  ): WebSocketMessage | undefined {
    if (data.from === ZERO_ADDRESS && data.to === ZERO_ADDRESS) {
      // create pool (handled by URI event)
      return undefined;
    } else if (data.from === ZERO_ADDRESS) {
      // mint
      const parts = unpackTokenId(data.id);
      return {
        event: 'token-mint',
        data: <TokenMintEvent>{
          pool_id: parts.pool_id,
          token_index: parts.token_index,
          to: data.to,
          amount: data.value,
        },
      };
    } else if (data.to === ZERO_ADDRESS) {
      // burn
      return undefined;
    } else {
      // transfer
      const parts = unpackTokenId(data.id);
      return {
        event: 'token-transfer',
        data: <TokenTransferEvent>{
          pool_id: parts.pool_id,
          token_index: parts.token_index,
          from: data.from,
          to: data.to,
          amount: data.value,
        },
      };
    }
  }
}
