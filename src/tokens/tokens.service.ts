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

import { HttpService, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WebSocketMessage } from '../websocket-events/websocket-events.base';
import { EventListener } from '../eventstream-proxy/eventstream-proxy.interfaces';
import { EventStreamProxyGateway } from '../eventstream-proxy/eventstream-proxy.gateway';
import { Event, EventStreamReply } from '../event-stream/event-stream.interfaces';
import { isFungible, packTokenId, unpackTokenId, encodeHex, decodeHex } from './tokens.util';
import {
  AsyncResponse,
  EthConnectAsyncResponse,
  EthConnectReturn,
  TokenBalance,
  TokenBalanceQuery,
  TokenCreateEvent,
  TokenMint,
  TokenMintEvent,
  TokenPool,
  TokenPoolEvent,
  TokenTransfer,
  TokenTransferEvent,
  TokenType,
  TransferSingleEvent,
} from './tokens.interfaces';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const tokenCreateEventSignature = 'TokenCreate(address,uint256,bytes)';
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

  private postOptions(requestId?: string) {
    const from = `${this.shortPrefix}-from`;
    const sync = `${this.shortPrefix}-sync`;
    const id = `${this.shortPrefix}-id`;
    return {
      params: {
        [from]: this.identity,
        [sync]: 'false',
        [id]: requestId,
      },
    };
  }

  async getReceipt(id: string): Promise<EventStreamReply> {
    const response = await this.http
      .get<EventStreamReply>(`${this.baseUrl}/reply/${id}`, {
        validateStatus: status => {
          return status < 300 || status === 404;
        },
      })
      .toPromise();
    if (response.status === 404) {
      throw new NotFoundException();
    }
    return response.data;
  }

  async createPool(dto: TokenPool): Promise<AsyncResponse> {
    const dataToPack = {
      trackingId: dto.trackingId,
      data: dto.data, // TODO: remove
    };
    const response = await this.http
      .post<EthConnectAsyncResponse>(
        `${this.instanceUrl}/create`,
        {
          is_fungible: dto.type === TokenType.FUNGIBLE,
          data: encodeHex(JSON.stringify(dataToPack)),
        },
        this.postOptions(dto.requestId),
      )
      .toPromise();
    return { id: response.data.id };
  }

  async mint(dto: TokenMint): Promise<AsyncResponse> {
    const typeId = packTokenId(dto.poolId);
    if (isFungible(dto.poolId)) {
      const response = await this.http
        .post<EthConnectAsyncResponse>(
          `${this.instanceUrl}/mintFungible`,
          {
            type_id: typeId,
            to: [dto.to],
            amounts: [dto.amount],
            data: dto.data === undefined ? [0] : encodeHex(dto.data),
          },
          this.postOptions(dto.requestId),
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
            type_id: typeId,
            to,
            data: dto.data === undefined ? [0] : encodeHex(dto.data),
          },
          this.postOptions(dto.requestId),
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
          id: packTokenId(dto.poolId, dto.tokenIndex),
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
          id: packTokenId(dto.poolId, dto.tokenIndex),
          amount: dto.amount,
          data: dto.data === undefined ? [0] : encodeHex(dto.data),
        },
        this.postOptions(dto.requestId),
      )
      .toPromise();
    return { id: response.data.id };
  }
}

class TokenListener implements EventListener {
  private readonly logger = new Logger(TokenListener.name);

  transformEvent(event: Event): WebSocketMessage | undefined {
    switch (event.signature) {
      case tokenCreateEventSignature:
        return this.transformTokenCreateEvent(event);
      case transferSingleEventSignature:
        return this.transformTransferSingleEvent(event);
      default:
        this.logger.error(`Unknown event signature: ${event.signature}`);
        return undefined;
    }
  }

  private transformTokenCreateEvent(event: TokenCreateEvent): WebSocketMessage {
    const { data } = event;
    const parts = unpackTokenId(data.type_id);
    let unpackedData: any;
    try {
      unpackedData = JSON.parse(decodeHex(data.data));
    } catch (err) {
      unpackedData = {};
    }
    return {
      event: 'token-pool',
      data: <TokenPoolEvent>{
        poolId: parts.poolId,
        type: parts.isFungible ? TokenType.FUNGIBLE : TokenType.NONFUNGIBLE,
        operator: data.operator,
        trackingId: unpackedData.trackingId,
        data: unpackedData.data, // TODO: remove
        transaction: {
          blockNumber: event.blockNumber,
          transactionIndex: event.transactionIndex,
          transactionHash: event.transactionHash,
        },
      },
    };
  }

  private transformTransferSingleEvent(event: TransferSingleEvent): WebSocketMessage | undefined {
    const { data } = event;
    const inputData = event.inputArgs?.data;

    if (data.from === ZERO_ADDRESS && data.to === ZERO_ADDRESS) {
      // should not happen
      return undefined;
    } else if (data.from === ZERO_ADDRESS) {
      // mint
      const parts = unpackTokenId(data.id);
      return {
        event: 'token-mint',
        data: <TokenMintEvent>{
          poolId: parts.poolId,
          tokenIndex: parts.tokenIndex,
          to: data.to,
          amount: data.value,
          operator: data.operator,
          data: inputData === undefined ? undefined : decodeHex(inputData),
          transaction: {
            blockNumber: event.blockNumber,
            transactionIndex: event.transactionIndex,
            transactionHash: event.transactionHash,
          },
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
          poolId: parts.poolId,
          tokenIndex: parts.tokenIndex,
          from: data.from,
          to: data.to,
          amount: data.value,
          operator: data.operator,
          data: inputData === undefined ? undefined : decodeHex(inputData),
          transaction: {
            blockNumber: event.blockNumber,
            transactionIndex: event.transactionIndex,
            transactionHash: event.transactionHash,
          },
        },
      };
    }
  }
}
