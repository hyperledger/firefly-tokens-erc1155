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

import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { Event, EventStreamReply } from '../event-stream/event-stream.interfaces';
import { EventStreamProxyGateway } from '../eventstream-proxy/eventstream-proxy.gateway';
import { EventListener } from '../eventstream-proxy/eventstream-proxy.interfaces';
import { WebSocketMessage } from '../websocket-events/websocket-events.base';
import {
  AsyncResponse,
  EthConnectAsyncResponse,
  EthConnectReturn,
  TokenBalance,
  TokenBalanceQuery,
  TokenBurn,
  TokenBurnEvent,
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
import { decodeHex, encodeHex, isFungible, packTokenId, unpackTokenId } from './tokens.util';

const TOKEN_STANDARD = 'ERC1155';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const tokenCreateEventSignature = 'TokenCreate(address,uint256,bytes)';
const transferSingleEventSignature = 'TransferSingle(address,address,address,uint256,uint256)';

@Injectable()
export class TokensService {
  baseUrl: string;
  instanceUrl: string;
  shortPrefix: string;

  constructor(private http: HttpService, proxy: EventStreamProxyGateway) {
    proxy.addListener(new TokenListener());
  }

  configure(baseUrl: string, instancePath: string, shortPrefix: string) {
    this.baseUrl = baseUrl;
    this.instanceUrl = baseUrl + instancePath;
    this.shortPrefix = shortPrefix;
  }

  private postOptions(operator: string, requestId?: string) {
    const from = `${this.shortPrefix}-from`;
    const sync = `${this.shortPrefix}-sync`;
    const id = `${this.shortPrefix}-id`;
    return {
      params: {
        [from]: operator,
        [sync]: 'false',
        [id]: requestId,
      },
    };
  }

  async getReceipt(id: string): Promise<EventStreamReply> {
    const response = await lastValueFrom(
      this.http.get<EventStreamReply>(`${this.baseUrl}/reply/${id}`, {
        validateStatus: status => {
          return status < 300 || status === 404;
        },
      }),
    );
    if (response.status === 404) {
      throw new NotFoundException();
    }
    return response.data;
  }

  async createPool(dto: TokenPool): Promise<AsyncResponse> {
    const response = await lastValueFrom(
      this.http.post<EthConnectAsyncResponse>(
        `${this.instanceUrl}/create`,
        {
          is_fungible: dto.type === TokenType.FUNGIBLE,
          data: encodeHex(dto.data ?? ''),
        },
        this.postOptions(dto.operator, dto.requestId),
      ),
    );
    return { id: response.data.id };
  }

  async mint(dto: TokenMint): Promise<AsyncResponse> {
    const typeId = packTokenId(dto.poolId);
    if (isFungible(dto.poolId)) {
      const response = await lastValueFrom(
        this.http.post<EthConnectAsyncResponse>(
          `${this.instanceUrl}/mintFungible`,
          {
            type_id: typeId,
            to: [dto.to],
            amounts: [dto.amount],
            data: encodeHex(dto.data ?? ''),
          },
          this.postOptions(dto.operator, dto.requestId),
        ),
      );
      return { id: response.data.id };
    } else {
      // In the case of a non-fungible token:
      // - We parse the value as a whole integer count of NFTs to mint
      // - We require the number to be small enough to express as a JS number (we're packing into an array)
      const to: string[] = [];
      const amount = parseInt(dto.amount);
      for (let i = 0; i < amount; i++) {
        to.push(dto.to);
      }

      const response = await lastValueFrom(
        this.http.post<EthConnectAsyncResponse>(
          `${this.instanceUrl}/mintNonFungible`,
          {
            type_id: typeId,
            to,
            data: encodeHex(dto.data ?? ''),
          },
          this.postOptions(dto.operator, dto.requestId),
        ),
      );
      return { id: response.data.id };
    }
  }

  async transfer(dto: TokenTransfer): Promise<AsyncResponse> {
    const response = await lastValueFrom(
      this.http.post<EthConnectAsyncResponse>(
        `${this.instanceUrl}/safeTransferFrom`,
        {
          from: dto.from,
          to: dto.to,
          id: packTokenId(dto.poolId, dto.tokenIndex),
          amount: dto.amount,
          data: encodeHex(dto.data ?? ''),
        },
        this.postOptions(dto.operator, dto.requestId),
      ),
    );
    return { id: response.data.id };
  }

  async burn(dto: TokenBurn): Promise<AsyncResponse> {
    const response = await lastValueFrom(
      this.http.post<EthConnectAsyncResponse>(
        `${this.instanceUrl}/burn`,
        {
          from: dto.from,
          id: packTokenId(dto.poolId, dto.tokenIndex),
          amount: dto.amount,
          data: encodeHex(dto.data ?? ''),
        },
        this.postOptions(dto.operator, dto.requestId),
      ),
    );
    return { id: response.data.id };
  }

  async balance(dto: TokenBalanceQuery): Promise<TokenBalance> {
    const response = await lastValueFrom(
      this.http.get<EthConnectReturn>(`${this.instanceUrl}/balanceOf`, {
        params: {
          account: dto.account,
          id: packTokenId(dto.poolId, dto.tokenIndex),
        },
      }),
    );
    return { balance: response.data.output };
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
    const unpackedId = unpackTokenId(data.type_id);
    return {
      event: 'token-pool',
      data: <TokenPoolEvent>{
        standard: TOKEN_STANDARD,
        poolId: unpackedId.poolId,
        type: unpackedId.isFungible ? TokenType.FUNGIBLE : TokenType.NONFUNGIBLE,
        operator: data.operator,
        data: decodeHex(data.data ?? ''),
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
    const unpackedId = unpackTokenId(data.id);
    const decodedData = decodeHex(event.inputArgs?.data ?? '');

    if (data.from === ZERO_ADDRESS && data.to === ZERO_ADDRESS) {
      // should not happen
      return undefined;
    } else if (data.from === ZERO_ADDRESS) {
      // mint
      return {
        event: 'token-mint',
        data: <TokenMintEvent>{
          poolId: unpackedId.poolId,
          tokenIndex: unpackedId.tokenIndex,
          to: data.to,
          amount: data.value,
          operator: data.operator,
          data: decodedData,
          transaction: {
            blockNumber: event.blockNumber,
            transactionIndex: event.transactionIndex,
            transactionHash: event.transactionHash,
          },
        },
      };
    } else if (data.to === ZERO_ADDRESS) {
      // burn
      return {
        event: 'token-burn',
        data: <TokenBurnEvent>{
          poolId: unpackedId.poolId,
          tokenIndex: unpackedId.tokenIndex,
          from: data.from,
          amount: data.value,
          operator: data.operator,
          data: decodedData,
          transaction: {
            blockNumber: event.blockNumber,
            transactionIndex: event.transactionIndex,
            transactionHash: event.transactionHash,
          },
        },
      };
    } else {
      // transfer
      return {
        event: 'token-transfer',
        data: <TokenTransferEvent>{
          poolId: unpackedId.poolId,
          tokenIndex: unpackedId.tokenIndex,
          from: data.from,
          to: data.to,
          amount: data.value,
          operator: data.operator,
          data: decodedData,
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
