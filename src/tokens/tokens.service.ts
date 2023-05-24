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

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventStreamService } from '../event-stream/event-stream.service';
import { EventStream, EventStreamSubscription } from '../event-stream/event-stream.interfaces';
import { EventStreamProxyGateway } from '../eventstream-proxy/eventstream-proxy.gateway';
import { Context, newContext } from '../request-context/request-context.decorator';
import {
  AsyncResponse,
  CheckInterfaceRequest,
  CheckInterfaceResponse,
  IAbiMethod,
  InterfaceFormat,
  TokenApproval,
  TokenBalance,
  TokenBalanceQuery,
  TokenBurn,
  TokenInterface,
  TokenMint,
  TokenPool,
  TokenPoolActivate,
  TokenPoolDeactivate,
  TokenTransfer,
} from './tokens.interfaces';
import {
  packStreamName,
  packSubscriptionName,
  packTokenId,
  unpackPoolLocator,
  unpackSubscriptionName,
} from './tokens.util';
import { TokenListener } from './tokens.listener';
import { BlockchainConnectorService } from './blockchain.service';
import { AbiMapperService } from './abimapper.service';
import {
  AllEvents,
  ApprovalForAll,
  BalanceOf,
  DynamicMethods,
  TransferBatch,
  TransferSingle,
} from './erc1155';

export const BASE_SUBSCRIPTION_NAME = 'base';

const tokenCreateEvent = 'TokenPoolCreation';
const ALL_SUBSCRIBED_EVENTS = [tokenCreateEvent, ...AllEvents.map(e => e.name)];

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);
  private contractAddress: string;

  baseUrl: string;
  instancePath: string;
  instanceUrl: string;
  topic: string;
  stream: EventStream | undefined;

  constructor(
    private eventstream: EventStreamService,
    private proxy: EventStreamProxyGateway,
    private blockchain: BlockchainConnectorService,
    private mapper: AbiMapperService,
  ) {}

  configure(baseUrl: string, instancePath: string, topic: string, contractAddress: string) {
    this.baseUrl = baseUrl;
    this.instancePath = instancePath;
    this.instanceUrl = new URL(this.instancePath, this.baseUrl).href;
    this.topic = topic;
    this.contractAddress = contractAddress.toLowerCase();
    this.proxy.addConnectionListener(this);
    this.proxy.addEventListener(new TokenListener(this.blockchain));
  }

  async onConnect() {
    const wsUrl = new URL('/ws', this.baseUrl.replace('http', 'ws')).href;
    const stream = await this.getStream(newContext());
    this.proxy.configure(wsUrl, stream.name);
  }

  /**
   * One-time initialization of event stream and base subscription.
   */
  async init(ctx: Context) {
    await this.createPoolSubscription(ctx, await this.getContractAddress(ctx));
  }

  private async createPoolSubscription(ctx: Context, address: string, blockNumber?: string) {
    const stream = await this.getStream(ctx);
    const eventABI = this.mapper.getCreateEvent();
    const methodABI = this.mapper.getCreateMethod();
    if (eventABI !== undefined && methodABI !== undefined) {
      await this.eventstream.getOrCreateSubscription(
        ctx,
        this.baseUrl,
        eventABI,
        stream.id,
        packSubscriptionName(address, BASE_SUBSCRIPTION_NAME, tokenCreateEvent),
        address,
        [methodABI],
        blockNumber ?? '0',
      );
    }
  }

  private async getContractAddress(ctx: Context) {
    if (!this.contractAddress) {
      this.logger.debug(
        `CONTRACT_ADDRESS is not set, fetching the address using instance url: ${this.instanceUrl}`,
      );
      const data = await this.blockchain.getContractInfo(ctx, this.instanceUrl);
      this.contractAddress = '0x' + data.address.toLowerCase();
      this.logger.debug(`Contract address: ${this.contractAddress}`);
    }
    return this.contractAddress;
  }

  private async getStream(ctx: Context) {
    const stream = this.stream;
    if (stream !== undefined) {
      return stream;
    }
    await this.migrationCheck(ctx);
    const name = this.stream?.name ?? packStreamName(this.topic, this.instancePath);
    this.logger.log('Creating stream with name ' + name);
    this.stream = await this.eventstream.createOrUpdateStream(ctx, name, name);
    return this.stream;
  }

  /**
   * Check for existing event streams and subscriptions that don't match the current
   * expected format (ie incorrect names, missing event subscriptions).
   *
   * Log a warning if any potential issues are flagged. User may need to delete
   * subscriptions manually and reactivate the pool directly.
   */
  async migrationCheck(ctx: Context) {
    const name = packStreamName(this.topic, this.instancePath);
    const streams = await this.eventstream.getStreams();
    let existingStream = streams.find(s => s.name === name);
    if (existingStream === undefined) {
      // Look for the old stream name (topic alone)
      existingStream = streams.find(s => s.name === this.topic);
      if (existingStream === undefined) {
        return false;
      }
      this.logger.warn(
        `Old event stream found with name ${existingStream.name}. ` +
          `The connector will continue to use this stream, but it is recommended ` +
          `to create a new stream with the name ${name}.`,
      );
    }
    this.stream = existingStream;
    const streamId = existingStream.id;

    const allSubscriptions = await this.eventstream.getSubscriptions(ctx);
    const subscriptions = allSubscriptions.filter(s => s.stream === streamId);
    if (subscriptions.length === 0) {
      return false;
    }

    const baseSubscription = packSubscriptionName(
      this.instancePath,
      BASE_SUBSCRIPTION_NAME,
      tokenCreateEvent,
    );

    const foundEvents = new Map<string, string[]>();
    for (const sub of subscriptions) {
      if (sub.name === baseSubscription) {
        continue;
      }
      const parts = unpackSubscriptionName(sub.name);
      if (parts.poolLocator === undefined || parts.event === undefined) {
        this.logger.warn(
          `Non-parseable subscription name '${sub.name}' found in event stream '${existingStream.name}'.` +
            `It is recommended to delete all subscriptions and activate all pools again.`,
        );
        return true;
      }
      const key = packSubscriptionName(parts.instancePath, parts.poolLocator, '', parts.poolData);
      const existing = foundEvents.get(key);
      if (existing !== undefined) {
        existing.push(parts.event);
      } else {
        foundEvents.set(key, [parts.event]);
      }
    }

    // Expect to have found subscriptions for each of the events.
    for (const [key, events] of foundEvents) {
      const parts = unpackSubscriptionName(key);
      if (
        ALL_SUBSCRIBED_EVENTS.length !== events.length ||
        !ALL_SUBSCRIBED_EVENTS.every(event => events.includes(event))
      ) {
        this.logger.warn(
          `Event stream subscriptions for pool ${parts.poolLocator} do not include all expected events ` +
            `(${ALL_SUBSCRIBED_EVENTS}). Events may not be properly delivered to this pool. ` +
            `It is recommended to delete its subscriptions and activate the pool again.`,
        );
        return true;
      }
    }
    return false;
  }

  async createPool(ctx: Context, dto: TokenPool): Promise<AsyncResponse> {
    if (dto.config?.address !== undefined && dto.config.address !== '') {
      await this.createPoolSubscription(ctx, dto.config.address, dto.config.blockNumber);
      return this.createWithAddress(ctx, dto.config.address, dto);
    }
    return this.createWithAddress(ctx, await this.getContractAddress(ctx), dto);
  }

  async createWithAddress(ctx: Context, address: string, dto: TokenPool) {
    this.logger.log(`Create token pool from contract: '${address}'`);
    const { method, params } = this.mapper.getCreateMethodAndParams(dto);
    const response = await this.blockchain.sendTransaction(
      ctx,
      dto.signer,
      address,
      dto.requestId,
      method,
      params,
    );
    return { id: response.id };
  }

  async activatePool(ctx: Context, dto: TokenPoolActivate) {
    const stream = await this.getStream(ctx);
    const poolLocator = unpackPoolLocator(dto.poolLocator);
    const address = poolLocator.address ?? (await this.getContractAddress(ctx));
    const abi = await this.mapper.getAbi(ctx, address);
    const tokenCreateEvent = this.mapper.getCreateEvent();
    const tokenCreateMethod = this.mapper.getCreateMethod();
    const possibleMethods = this.mapper.allInvokeMethods(abi);

    const promises: Promise<EventStreamSubscription>[] = [];
    if (tokenCreateEvent?.name !== undefined && tokenCreateMethod !== undefined) {
      promises.push(
        this.eventstream.getOrCreateSubscription(
          ctx,
          this.baseUrl,
          tokenCreateEvent,
          stream.id,
          packSubscriptionName(
            this.instancePath,
            dto.poolLocator,
            tokenCreateEvent.name,
            dto.poolData,
          ),
          address,
          [tokenCreateMethod],
          poolLocator.blockNumber ?? '0',
        ),
      );
    }
    promises.push(
      ...[
        this.eventstream.getOrCreateSubscription(
          ctx,
          this.baseUrl,
          TransferSingle,
          stream.id,
          packSubscriptionName(
            this.instancePath,
            dto.poolLocator,
            TransferSingle.name,
            dto.poolData,
          ),
          address,
          possibleMethods,
          poolLocator.blockNumber ?? '0',
        ),
        this.eventstream.getOrCreateSubscription(
          ctx,
          this.baseUrl,
          TransferBatch,
          stream.id,
          packSubscriptionName(
            this.instancePath,
            dto.poolLocator,
            TransferBatch.name,
            dto.poolData,
          ),
          address,
          possibleMethods,
          poolLocator.blockNumber ?? '0',
        ),
        this.eventstream.getOrCreateSubscription(
          ctx,
          this.baseUrl,
          ApprovalForAll,
          stream.id,
          packSubscriptionName(
            this.instancePath,
            dto.poolLocator,
            ApprovalForAll.name,
            dto.poolData,
          ),
          address,
          possibleMethods,
          // Block number is 0 because it is important to receive all approval events,
          // so existing approvals will be reflected in the newly created pool
          '0',
        ),
      ],
    );
    await Promise.all(promises);
  }

  async deactivatePool(ctx: Context, dto: TokenPoolDeactivate) {
    const tokenCreateEvent = this.mapper.getCreateEvent();
    const stream = await this.getStream(ctx);

    const promises: Promise<boolean>[] = [];
    if (tokenCreateEvent?.name !== undefined) {
      promises.push(
        this.eventstream.deleteSubscriptionByName(
          ctx,
          stream.id,
          packSubscriptionName(
            this.instancePath,
            dto.poolLocator,
            tokenCreateEvent.name,
            dto.poolData,
          ),
        ),
      );
    }

    promises.push(
      ...[
        this.eventstream.deleteSubscriptionByName(
          ctx,
          stream.id,
          packSubscriptionName(
            this.instancePath,
            dto.poolLocator,
            TransferSingle.name,
            dto.poolData,
          ),
        ),
        this.eventstream.deleteSubscriptionByName(
          ctx,
          stream.id,
          packSubscriptionName(
            this.instancePath,
            dto.poolLocator,
            TransferBatch.name,
            dto.poolData,
          ),
        ),
        this.eventstream.deleteSubscriptionByName(
          ctx,
          stream.id,
          packSubscriptionName(
            this.instancePath,
            dto.poolLocator,
            ApprovalForAll.name,
            dto.poolData,
          ),
        ),
      ],
    );

    const results = await Promise.all(promises);
    if (results.every(deleted => !deleted)) {
      throw new NotFoundException('No listeners found');
    }
  }

  checkInterface(dto: CheckInterfaceRequest): CheckInterfaceResponse {
    const wrapMethods = (methods: IAbiMethod[]): TokenInterface => {
      return { format: InterfaceFormat.ABI, methods };
    };

    return {
      approval: wrapMethods(this.mapper.getAllMethods(dto.methods, DynamicMethods.approval)),
      burn: wrapMethods(this.mapper.getAllMethods(dto.methods, DynamicMethods.burn)),
      mint: wrapMethods(this.mapper.getAllMethods(dto.methods, DynamicMethods.mint)),
      transfer: wrapMethods(this.mapper.getAllMethods(dto.methods, DynamicMethods.transfer)),
    };
  }

  async mint(ctx: Context, dto: TokenMint): Promise<AsyncResponse> {
    const poolLocator = unpackPoolLocator(dto.poolLocator);
    const address = poolLocator.address ?? (await this.getContractAddress(ctx));
    const abi = dto.interface?.methods || (await this.mapper.getAbi(ctx, address));
    const { method, params } = this.mapper.getMethodAndParams(abi, poolLocator, 'mint', dto);
    const response = await this.blockchain.sendTransaction(
      ctx,
      dto.signer,
      address,
      dto.requestId,
      method,
      params,
    );
    return { id: response.id };
  }

  async transfer(ctx: Context, dto: TokenTransfer): Promise<AsyncResponse> {
    const poolLocator = unpackPoolLocator(dto.poolLocator);
    const address = poolLocator.address ?? (await this.getContractAddress(ctx));
    const abi = dto.interface?.methods || (await this.mapper.getAbi(ctx, address));
    const { method, params } = this.mapper.getMethodAndParams(abi, poolLocator, 'transfer', dto);
    const response = await this.blockchain.sendTransaction(
      ctx,
      dto.signer,
      address,
      dto.requestId,
      method,
      params,
    );
    return { id: response.id };
  }

  async burn(ctx: Context, dto: TokenBurn): Promise<AsyncResponse> {
    const poolLocator = unpackPoolLocator(dto.poolLocator);
    const address = poolLocator.address ?? (await this.getContractAddress(ctx));
    const abi = dto.interface?.methods || (await this.mapper.getAbi(ctx, address));
    const { method, params } = this.mapper.getMethodAndParams(abi, poolLocator, 'burn', dto);
    const response = await this.blockchain.sendTransaction(
      ctx,
      dto.signer,
      address,
      dto.requestId,
      method,
      params,
    );
    return { id: response.id };
  }

  async approval(ctx: Context, dto: TokenApproval): Promise<AsyncResponse> {
    const poolLocator = unpackPoolLocator(dto.poolLocator);
    const address = poolLocator.address ?? (await this.getContractAddress(ctx));
    const abi = dto.interface?.methods || (await this.mapper.getAbi(ctx, address));
    const { method, params } = this.mapper.getMethodAndParams(abi, poolLocator, 'approval', dto);
    const response = await this.blockchain.sendTransaction(
      ctx,
      dto.signer,
      address,
      dto.requestId,
      method,
      params,
    );
    return { id: response.id };
  }

  async balance(ctx: Context, dto: TokenBalanceQuery): Promise<TokenBalance> {
    const poolLocator = unpackPoolLocator(dto.poolLocator);
    const address = poolLocator.address ?? (await this.getContractAddress(ctx));
    const response = await this.blockchain.query(ctx, address, BalanceOf, [
      dto.account,
      packTokenId(poolLocator.poolId, dto.tokenIndex),
    ]);
    return { balance: response.output };
  }
}
