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
import { EventStreamService } from '../event-stream/event-stream.service';
import { Event, EventStream, EventStreamReply } from '../event-stream/event-stream.interfaces';
import { EventStreamProxyGateway } from '../eventstream-proxy/eventstream-proxy.gateway';
import { EventListener, EventProcessor } from '../eventstream-proxy/eventstream-proxy.interfaces';
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
  TokenPoolActivate,
  TokenPoolEvent,
  TokenTransfer,
  TokenTransferEvent,
  TokenType,
  TransferSingleEvent,
} from './tokens.interfaces';
import {
  decodeHex,
  encodeHex,
  encodeHexIDForURI,
  isFungible,
  packSubscriptionName,
  packTokenId,
  unpackSubscriptionName,
  unpackTokenId,
} from './tokens.util';

const TOKEN_STANDARD = 'ERC1155';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const BASE_SUBSCRIPTION_NAME = 'base';

const tokenCreateEvent = 'TokenCreate';
const tokenCreateEventSignature = 'TokenCreate(address,uint256,bytes)';
const transferSingleEvent = 'TransferSingle';
const transferSingleEventSignature = 'TransferSingle(address,address,address,uint256,uint256)';

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);

  baseUrl: string;
  instancePath: string;
  instanceUrl: string;
  topic: string;
  shortPrefix: string;
  stream: EventStream;

  constructor(
    private http: HttpService,
    private eventstream: EventStreamService,
    private proxy: EventStreamProxyGateway,
  ) {}

  configure(baseUrl: string, instancePath: string, topic: string, shortPrefix: string) {
    this.baseUrl = baseUrl;
    this.instancePath = instancePath;
    this.instanceUrl = baseUrl + instancePath;
    this.topic = topic;
    this.shortPrefix = shortPrefix;
    this.proxy.addListener(new TokenListener(this.http, this.instanceUrl, this.topic));
  }

  /**
   * One-time initialization of event stream and base subscription.
   */
  async init() {
    this.stream = await this.eventstream.createOrUpdateStream(this.topic);
    await this.eventstream.getOrCreateSubscription(
      this.instancePath,
      this.stream.id,
      tokenCreateEvent,
      packSubscriptionName(this.topic, BASE_SUBSCRIPTION_NAME),
    );
  }

  /**
   * If there is an existing event stream whose subscriptions don't match the current
   * naming format, delete the stream so we'll start over.
   * This will cause redelivery of all token-pool events from block 0, which will poke
   * FireFly to activate them and create the other necessary subscriptions.
   *
   * TODO: eventually this migration logic can be pruned
   */
  async migrate() {
    const streams = await this.eventstream.getStreams();
    const existingStream = streams.find(s => s.name === this.topic);
    if (existingStream === undefined) {
      return;
    }
    const subscriptions = await this.eventstream.getSubscriptions();
    for (const sub of subscriptions.filter(s => s.stream === existingStream.id)) {
      if (!sub.name.startsWith(this.topic)) {
        this.logger.warn('Old event stream subscriptions found - deleting and recreating');
        await this.eventstream.deleteStream(existingStream.id);
        await this.init();
        break;
      }
    }
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
        validateStatus: status => status < 300 || status === 404,
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

  async activatePool(dto: TokenPoolActivate) {
    await Promise.all([
      this.eventstream.getOrCreateSubscription(
        this.instancePath,
        this.stream.id,
        tokenCreateEvent,
        packSubscriptionName(this.topic, dto.poolId, tokenCreateEvent),
        dto.transaction?.blockNumber ?? '0',
      ),
      this.eventstream.getOrCreateSubscription(
        this.instancePath,
        this.stream.id,
        transferSingleEvent,
        packSubscriptionName(this.topic, dto.poolId, transferSingleEvent),
        dto.transaction?.blockNumber ?? '0',
      ),
    ]);
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

  private uriPattern: string | undefined;

  constructor(private http: HttpService, private instanceUrl: string, private topic: string) {}

  async onEvent(subName: string, event: Event, process: EventProcessor) {
    switch (event.signature) {
      case tokenCreateEventSignature:
        process(this.transformTokenCreateEvent(subName, event));
        break;
      case transferSingleEventSignature:
        process(await this.transformTransferSingleEvent(subName, event));
        break;
      default:
        this.logger.error(`Unknown event signature: ${event.signature}`);
        return undefined;
    }
  }

  private transformTokenCreateEvent(
    subName: string,
    event: TokenCreateEvent,
  ): WebSocketMessage | undefined {
    const { data } = event;
    const unpackedId = unpackTokenId(data.type_id);
    const unpackedSub = unpackSubscriptionName(this.topic, subName);
    const decodedData = decodeHex(data.data ?? '');

    if (unpackedSub.poolId !== BASE_SUBSCRIPTION_NAME && unpackedSub.poolId !== unpackedId.poolId) {
      return undefined;
    }

    return {
      event: 'token-pool',
      data: <TokenPoolEvent>{
        standard: TOKEN_STANDARD,
        poolId: unpackedId.poolId,
        type: unpackedId.isFungible ? TokenType.FUNGIBLE : TokenType.NONFUNGIBLE,
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

  private async transformTransferSingleEvent(
    subName: string,
    event: TransferSingleEvent,
  ): Promise<WebSocketMessage | undefined> {
    const { data } = event;
    const unpackedId = unpackTokenId(data.id);
    const unpackedSub = unpackSubscriptionName(this.topic, subName);
    const decodedData = decodeHex(event.inputArgs?.data ?? '');

    if (unpackedSub.poolId !== unpackedId.poolId) {
      // this transfer is not from the subscribed pool
      return undefined;
    }
    if (data.from === ZERO_ADDRESS && data.to === ZERO_ADDRESS) {
      // should not happen
      return undefined;
    }

    const commonData = {
      poolId: unpackedId.poolId,
      tokenIndex: unpackedId.tokenIndex,
      uri: await this.getTokenUri(data.id),
      amount: data.value,
      operator: data.operator,
      data: decodedData,
      transaction: {
        blockNumber: event.blockNumber,
        transactionIndex: event.transactionIndex,
        transactionHash: event.transactionHash,
      },
    };

    if (data.from === ZERO_ADDRESS) {
      return {
        event: 'token-mint',
        data: <TokenMintEvent>{ ...commonData, to: data.to },
      };
    } else if (data.to === ZERO_ADDRESS) {
      return {
        event: 'token-burn',
        data: <TokenBurnEvent>{ ...commonData, from: data.from },
      };
    } else {
      return {
        event: 'token-transfer',
        data: <TokenTransferEvent>{ ...commonData, from: data.from, to: data.to },
      };
    }
  }

  private async getTokenUri(id: string) {
    if (this.uriPattern === undefined) {
      // Fetch and cache the URI pattern (assume it is the same for all tokens)
      try {
        const response = await lastValueFrom(
          this.http.get<EthConnectReturn>(`${this.instanceUrl}/uri?input=0`),
        );
        this.uriPattern = response.data.output;
      } catch (err) {
        return '';
      }
    }
    return this.uriPattern.replace('{id}', encodeHexIDForURI(id));
  }
}
