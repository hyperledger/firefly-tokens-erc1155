// Copyright © 2024 Kaleido, Inc.
//
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE -2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventStreamService } from '../event-stream/event-stream.service';
import { EventStream, EventStreamSubscription } from '../event-stream/event-stream.interfaces';
import { EventStreamProxyGateway } from '../eventstream-proxy/eventstream-proxy.gateway';
import { Context } from '../request-context/request-context.decorator';
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
  TokenPoolEvent,
  TokenTransfer,
  TokenType,
} from './tokens.interfaces';
import {
  packStreamName,
  packSubscriptionName,
  computeTokenId,
  unpackPoolLocator,
  packPoolLocator,
} from './tokens.util';
import { TOKEN_STANDARD, TokenListener } from './tokens.listener';
import { BlockchainConnectorService } from './blockchain.service';
import { AbiMapperService, tokenCreateEvent } from './abimapper.service';
import {
  AllEvents,
  ApprovalForAll,
  BalanceOf,
  DynamicMethods,
  TransferBatch,
  TransferSingle,
} from './erc1155';
import { eventStreamName } from '../utils';

export const BASE_SUBSCRIPTION_NAME = 'base';

const ALL_SUBSCRIBED_EVENTS = [
  tokenCreateEvent,
  tokenCreateEvent + 'V2',
  ...AllEvents.map(e => e.name),
];

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);
  private contractAddress: string;

  baseUrl: string;
  instancePath: string;
  topic: string;
  streamCache: Map<string, EventStream> = new Map();

  constructor(
    private eventstream: EventStreamService,
    private proxy: EventStreamProxyGateway,
    private blockchain: BlockchainConnectorService,
    private mapper: AbiMapperService,
  ) {}

  configure(baseUrl: string, instancePath: string, topic: string, contractAddress: string) {
    this.baseUrl = baseUrl;
    this.instancePath = instancePath;
    this.topic = topic;
    this.contractAddress = contractAddress.toLowerCase();
    this.proxy.addEventListener(new TokenListener(this.blockchain));
    const wsUrl = new URL('/ws', this.baseUrl.replace('http', 'ws')).href;
    this.proxy.configure(wsUrl, this.topic);
  }

  private async createPoolSubscription(
    ctx: Context,
    namespace: string,
    address: string,
    poolLocator: string,
    blockNumber?: string,
    poolData?: string,
  ) {
    const stream = await this.getStream(ctx, namespace);
    const eventABIV1 = this.mapper.getCreateEventV1();
    const eventABIV2 = this.mapper.getCreateEventV2();
    const methodABI = this.mapper.getCreateMethod();
    const promises: Promise<EventStreamSubscription>[] = [];
    if (eventABIV1 !== undefined && methodABI !== undefined) {
      promises.push(
        this.eventstream.getOrCreateSubscription(
          ctx,
          this.baseUrl,
          eventABIV1,
          stream.id,
          packSubscriptionName(address, poolLocator, tokenCreateEvent, poolData),
          address,
          [methodABI],
          blockNumber ?? '0',
        ),
      );
    }
    if (eventABIV2 !== undefined && methodABI !== undefined) {
      promises.push(
        this.eventstream.getOrCreateSubscription(
          ctx,
          this.baseUrl,
          eventABIV2,
          stream.id,
          packSubscriptionName(address, poolLocator, tokenCreateEvent + 'V2', poolData),
          address,
          [methodABI],
          blockNumber ?? '0',
        ),
      );
    }
    return Promise.all(promises);
  }

  private async getContractAddress(ctx: Context) {
    if (!this.contractAddress) {
      if (!this.instancePath) {
        return undefined;
      }
      const instanceUrl = new URL(this.instancePath, this.baseUrl).href;
      this.logger.debug(
        `CONTRACT_ADDRESS is not set - fetching the address using instance url: ${instanceUrl}`,
      );
      const data = await this.blockchain.getContractInfo(ctx, instanceUrl);
      this.contractAddress = '0x' + data.address.toLowerCase();
      this.logger.debug(`Contract address: ${this.contractAddress}`);
    }
    return this.contractAddress;
  }

  private async getStream(ctx: Context, namespace: string) {
    let stream = this.streamCache.get(namespace);
    if (stream !== undefined) {
      return stream;
    }
    await this.migrationCheck(ctx);
    this.logger.log('Creating stream with name ' + eventStreamName(this.topic, namespace));
    stream = await this.eventstream.createOrUpdateStream(
      ctx,
      `${eventStreamName(this.topic, namespace)}`,
      this.topic,
    );
    this.streamCache.set(namespace, stream);
    return stream;
  }

  /**
   * Check for existing event streams and subscriptions that don't match the current
   * expected format (ie incorrect names, missing event subscriptions).
   *
   * Log a warning if any potential issues are flagged. User may need to delete
   * subscriptions manually and reactivate the pool directly.
   */
  async migrationCheck(ctx: Context) {
    const currentName = packStreamName(this.topic, this.contractAddress);
    const oldName1 = packStreamName(this.topic, this.instancePath);
    const oldName2 = packStreamName(this.topic, '');
    const oldName3 = this.topic;

    const existingStreams = await this.eventstream.getStreams(ctx);
    // Check to see if there is a deprecated stream that we should remove
    this.logger.debug(
      `Checking for deprecated event steams named '${currentName}' or '${oldName1}' or '${oldName2}' or '${oldName3}'`,
    );
    const deprecatedStreams = existingStreams.filter(
      s =>
        s.name === currentName || s.name === oldName1 || s.name === oldName2 || s.name === oldName3,
    );
    for (const deprecatedStream of deprecatedStreams) {
      this.logger.log(`Purging deprecated eventstream '${deprecatedStream.id}'`);
      await this.eventstream.deleteStream(ctx, deprecatedStream.id);
    }
  }

  async createPool(ctx: Context, dto: TokenPool): Promise<TokenPoolEvent | AsyncResponse> {
    if (dto.config?.address) {
      if (dto.config.startId !== undefined && dto.config.endId !== undefined) {
        return this.createFromExisting(
          dto.config.address,
          dto.config.startId,
          dto.config.endId,
          dto,
        );
      }
      await this.createPoolSubscription(
        ctx,
        dto.namespace,
        dto.config.address,
        BASE_SUBSCRIPTION_NAME,
        dto.config.blockNumber,
      );
      return this.createWithAddress(ctx, dto.config.address, dto);
    }

    const defaultContract = await this.getContractAddress(ctx);
    if (defaultContract !== undefined) {
      await this.createPoolSubscription(
        ctx,
        dto.namespace,
        defaultContract,
        BASE_SUBSCRIPTION_NAME,
        dto.config?.blockNumber,
      );

      return this.createWithAddress(ctx, defaultContract, dto);
    }

    throw new BadRequestException(
      'config.address was unspecified, and no default contract address is configured!',
    );
  }

  private createFromExisting(address: string, startId: string, endId: string, dto: TokenPool) {
    const isFungible = dto.type === TokenType.FUNGIBLE;
    return <TokenPoolEvent>{
      data: dto.data,
      poolLocator: packPoolLocator(address, isFungible, startId, endId, dto.config?.blockNumber),
      standard: TOKEN_STANDARD,
      interfaceFormat: InterfaceFormat.ABI,
      type: dto.type,
      info: { address, startId, endId },
    };
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
    const stream = await this.getStream(ctx, dto.namespace);
    const poolLocator = unpackPoolLocator(dto.poolLocator);
    const address = poolLocator.address ?? (await this.getContractAddress(ctx));
    if (!address) {
      throw new InternalServerErrorException(`No contract address configured`);
    }

    const abi = await this.mapper.getAbi(ctx, address);
    const possibleMethods = this.mapper.allInvokeMethods(abi);

    const promises: Promise<EventStreamSubscription | EventStreamSubscription[]>[] = [
      this.createPoolSubscription(
        ctx,
        dto.namespace,
        address,
        dto.poolLocator,
        poolLocator.blockNumber,
        dto.poolData,
      ),
      this.eventstream.getOrCreateSubscription(
        ctx,
        this.baseUrl,
        TransferSingle,
        stream.id,
        packSubscriptionName(address, dto.poolLocator, TransferSingle.name, dto.poolData),
        address,
        possibleMethods,
        poolLocator.blockNumber ?? '0',
      ),
      this.eventstream.getOrCreateSubscription(
        ctx,
        this.baseUrl,
        TransferBatch,
        stream.id,
        packSubscriptionName(address, dto.poolLocator, TransferBatch.name, dto.poolData),
        address,
        possibleMethods,
        poolLocator.blockNumber ?? '0',
      ),
      this.eventstream.getOrCreateSubscription(
        ctx,
        this.baseUrl,
        ApprovalForAll,
        stream.id,
        packSubscriptionName(address, dto.poolLocator, ApprovalForAll.name, dto.poolData),
        address,
        possibleMethods,
        // Block number is 0 because it is important to receive all approval events,
        // so existing approvals will be reflected in the newly created pool
        '0',
      ),
    ];
    await Promise.all(promises);

    if (
      dto.config?.address !== undefined &&
      dto.config?.startId !== undefined &&
      dto.config?.endId !== undefined
    ) {
      return <TokenPoolEvent>{
        poolData: dto.poolData,
        poolLocator: dto.poolLocator,
        standard: TOKEN_STANDARD,
        interfaceFormat: InterfaceFormat.ABI,
        type: poolLocator.isFungible ? TokenType.FUNGIBLE : TokenType.NONFUNGIBLE,
        info: { address, startId: dto.config.startId, endId: dto.config.endId },
      };
    }

    return undefined;
  }

  async deactivatePool(ctx: Context, dto: TokenPoolDeactivate) {
    const poolLocator = unpackPoolLocator(dto.poolLocator);
    const address = poolLocator.address ?? '';
    const subscriptionNames = [
      // current subscription names
      packSubscriptionName(address, dto.poolLocator, tokenCreateEvent, dto.poolData),
      packSubscriptionName(address, dto.poolLocator, tokenCreateEvent + 'V2', dto.poolData),
      packSubscriptionName(address, dto.poolLocator, TransferSingle.name, dto.poolData),
      packSubscriptionName(address, dto.poolLocator, TransferBatch.name, dto.poolData),
      packSubscriptionName(address, dto.poolLocator, ApprovalForAll.name, dto.poolData),
      // older name format
      packSubscriptionName(this.instancePath, dto.poolLocator, tokenCreateEvent, dto.poolData),
      packSubscriptionName(this.instancePath, dto.poolLocator, TransferSingle.name, dto.poolData),
      packSubscriptionName(this.instancePath, dto.poolLocator, TransferBatch.name, dto.poolData),
      packSubscriptionName(this.instancePath, dto.poolLocator, ApprovalForAll.name, dto.poolData),
    ];

    const stream = await this.getStream(ctx, dto.namespace);
    const results = await Promise.all(
      subscriptionNames.map(name =>
        this.eventstream.deleteSubscriptionByName(ctx, stream.id, name),
      ),
    );

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
    if (!address) {
      throw new InternalServerErrorException(`No contract address configured`);
    }

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
    if (!address) {
      throw new InternalServerErrorException(`No contract address configured`);
    }

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
    if (!address) {
      throw new InternalServerErrorException(`No contract address configured`);
    }

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
    if (!address) {
      throw new InternalServerErrorException(`No contract address configured`);
    }

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
    if (!address) {
      throw new InternalServerErrorException(`No contract address configured`);
    }

    const response = await this.blockchain.query(ctx, address, BalanceOf, [
      dto.account,
      computeTokenId(poolLocator, dto.tokenIndex),
    ]);
    return { balance: response.output };
  }
}
