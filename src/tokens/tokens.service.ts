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

import { Injectable, Logger } from '@nestjs/common';
import { abi as ERC1155MixedFungibleAbi } from '../abi/ERC1155MixedFungible.json';
import { EventStreamService } from '../event-stream/event-stream.service';
import { EventStream } from '../event-stream/event-stream.interfaces';
import { EventStreamProxyGateway } from '../eventstream-proxy/eventstream-proxy.gateway';
import {
  AsyncResponse,
  TokenApproval,
  TokenBalance,
  TokenBalanceQuery,
  TokenBurn,
  TokenMint,
  TokenPool,
  TokenPoolActivate,
  TokenTransfer,
  TokenType,
} from './tokens.interfaces';
import {
  encodeHex,
  isFungible,
  packStreamName,
  packSubscriptionName,
  packTokenId,
  unpackPoolLocator,
  unpackSubscriptionName,
} from './tokens.util';
import { TokenListener } from './tokens.listener';
import { BlockchainConnectorService } from './blockchain.service';

export const BASE_SUBSCRIPTION_NAME = 'base';

const CUSTOM_URI_IID = '0xa1d87d57';

const tokenCreateFunctionName = 'create';
const tokenCreateEvent = 'TokenPoolCreation';
const transferSingleEvent = 'TransferSingle';
const transferBatchEvent = 'TransferBatch';
const approvalForAllEvent = 'ApprovalForAll';

const ALL_SUBSCRIBED_EVENTS = [
  tokenCreateEvent,
  transferSingleEvent,
  transferBatchEvent,
  approvalForAllEvent,
];

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);
  private contractAddress: string;
  private supportsCustomUri: boolean;

  baseUrl: string;
  instancePath: string;
  instanceUrl: string;
  topic: string;
  stream: EventStream | undefined;

  constructor(
    private eventstream: EventStreamService,
    private proxy: EventStreamProxyGateway,
    private blockchain: BlockchainConnectorService,
  ) {}

  configure(baseUrl: string, instancePath: string, topic: string, contractAddress: string) {
    this.baseUrl = baseUrl;
    this.instancePath = instancePath;
    this.instanceUrl = new URL(this.instancePath, this.baseUrl).href;
    this.topic = topic;
    this.contractAddress = contractAddress.toLowerCase();
    this.proxy.addConnectionListener(this);
    this.proxy.addEventListener(new TokenListener(this, this.blockchain));
  }

  async onConnect() {
    const wsUrl = new URL('/ws', this.baseUrl.replace('http', 'ws')).href;
    const stream = await this.getStream();
    this.proxy.configure(wsUrl, stream.name);
  }

  /**
   * One-time initialization of event stream and base subscription.
   */
  async init() {
    await this.createPoolSubscription(await this.getContractAddress());
  }

  private async createPoolSubscription(address: string, blockNumber?: string) {
    const stream = await this.getStream();
    const eventABI = ERC1155MixedFungibleAbi.find(m => m.name === tokenCreateEvent);
    const methodABI = ERC1155MixedFungibleAbi.find(m => m.name === tokenCreateFunctionName);
    if (eventABI !== undefined && methodABI !== undefined) {
      await this.eventstream.getOrCreateSubscription(
        this.baseUrl,
        eventABI,
        stream.id,
        tokenCreateEvent,
        packSubscriptionName(address, BASE_SUBSCRIPTION_NAME, tokenCreateEvent),
        address,
        [methodABI],
        blockNumber ?? '0',
      );
    }
  }

  private async getContractAddress() {
    if (!this.contractAddress) {
      this.logger.debug(
        `CONTRACT_ADDRESS is not set, fetching the address using instance url: ${this.instanceUrl}`,
      );
      const data = await this.blockchain.getContractInfo(this.instanceUrl);
      this.contractAddress = '0x' + data.address.toLowerCase();
      this.logger.debug(`Contract address: ${this.contractAddress}`);
    }
    return this.contractAddress;
  }

  async isCustomUriSupported(address: string) {
    if (this.supportsCustomUri === undefined) {
      try {
        const result = await this.blockchain.query(
          address,
          ERC1155MixedFungibleAbi.find(m => m.name === 'supportsInterface'),
          [CUSTOM_URI_IID],
        );
        this.logger.debug(
          `Result for URI support on instance '${this.instancePath}': ${result.output}`,
        );
        this.supportsCustomUri = result.output === true;
      } catch (err) {
        this.logger.log(
          `Failed to query URI support on instance '${this.instancePath}': assuming false`,
        );
        this.supportsCustomUri = false;
      }
    }
    return this.supportsCustomUri;
  }

  async queryBaseUri(address: string) {
    try {
      const result = await this.blockchain.query(
        address,
        ERC1155MixedFungibleAbi.find(m => m.name === 'baseTokenUri'),
        [CUSTOM_URI_IID],
      );
      return result.output as string;
    } catch (err) {
      this.logger.error(`Failed to query base URI`);
      return '';
    }
  }

  private async getStream() {
    const stream = this.stream;
    if (stream !== undefined) {
      return stream;
    }
    await this.migrationCheck();
    const name = this.stream?.name ?? packStreamName(this.topic, this.instancePath);
    this.logger.log('Creating stream with name ' + name);
    this.stream = await this.eventstream.createOrUpdateStream(name, name);
    return this.stream;
  }

  /**
   * Check for existing event streams and subscriptions that don't match the current
   * expected format (ie incorrect names, missing event subscriptions).
   *
   * Log a warning if any potential issues are flagged. User may need to delete
   * subscriptions manually and reactivate the pool directly.
   */
  async migrationCheck() {
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

    const allSubscriptions = await this.eventstream.getSubscriptions();
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

  async createPool(dto: TokenPool): Promise<AsyncResponse> {
    if (dto.config?.address !== undefined && dto.config.address !== '') {
      await this.createPoolSubscription(dto.config.address, dto.config.blockNumber);
      return this.createWithAddress(dto.config.address, dto);
    }
    return this.createWithAddress(await this.getContractAddress(), dto);
  }

  async createWithAddress(address: string, dto: TokenPool) {
    this.logger.log(`Create token pool from contract: '${address}'`);
    const response = await this.blockchain.sendTransaction(
      dto.signer,
      address,
      dto.requestId,
      ERC1155MixedFungibleAbi.find(m => m.name === tokenCreateFunctionName),
      [dto.type === TokenType.FUNGIBLE, encodeHex(dto.data ?? '')],
    );
    return { id: response.id };
  }

  async activatePool(dto: TokenPoolActivate) {
    const stream = await this.getStream();
    const poolLocator = unpackPoolLocator(dto.poolLocator);
    const address = poolLocator.address ?? (await this.getContractAddress());

    const tokenCreateEventABI = ERC1155MixedFungibleAbi.find(m => m.name === tokenCreateEvent);
    const tokenCreateFunctionABI = ERC1155MixedFungibleAbi.find(
      m => m.name === tokenCreateFunctionName,
    );
    const transferSingleEventABI = ERC1155MixedFungibleAbi.find(
      m => m.name === transferSingleEvent,
    );
    const transferBatchEventABI = ERC1155MixedFungibleAbi.find(m => m.name === transferBatchEvent);
    const transferFunctionABIs = ERC1155MixedFungibleAbi.filter(
      m =>
        m.name !== undefined &&
        (m.name.toLowerCase().includes('mint') ||
          m.name.toLowerCase().includes('transfer') ||
          m.name.toLowerCase().includes('burn')),
    );
    const approvalForAllEventABI = ERC1155MixedFungibleAbi.find(
      m => m.name === approvalForAllEvent,
    );
    const approvalFunctionABIs = ERC1155MixedFungibleAbi.filter(m =>
      m.name?.toLowerCase().includes('approval'),
    );

    if (
      tokenCreateEventABI !== undefined &&
      tokenCreateFunctionABI !== undefined &&
      transferSingleEventABI !== undefined &&
      transferBatchEventABI !== undefined &&
      approvalForAllEventABI !== undefined
    ) {
      await Promise.all([
        this.eventstream.getOrCreateSubscription(
          this.baseUrl,
          tokenCreateEventABI,
          stream.id,
          tokenCreateEvent,
          packSubscriptionName(this.instancePath, dto.poolLocator, tokenCreateEvent, dto.poolData),
          address,
          [tokenCreateFunctionABI],
          poolLocator.blockNumber ?? '0',
        ),
        this.eventstream.getOrCreateSubscription(
          this.baseUrl,
          transferSingleEventABI,
          stream.id,
          transferSingleEvent,
          packSubscriptionName(
            this.instancePath,
            dto.poolLocator,
            transferSingleEvent,
            dto.poolData,
          ),
          address,
          transferFunctionABIs,
          poolLocator.blockNumber ?? '0',
        ),
        this.eventstream.getOrCreateSubscription(
          this.baseUrl,
          transferBatchEventABI,
          stream.id,
          transferBatchEvent,
          packSubscriptionName(
            this.instancePath,
            dto.poolLocator,
            transferBatchEvent,
            dto.poolData,
          ),
          address,
          transferFunctionABIs,
          poolLocator.blockNumber ?? '0',
        ),
        this.eventstream.getOrCreateSubscription(
          this.baseUrl,
          approvalForAllEventABI,
          stream.id,
          approvalForAllEvent,
          packSubscriptionName(
            this.instancePath,
            dto.poolLocator,
            approvalForAllEvent,
            dto.poolData,
          ),
          address,
          approvalFunctionABIs,
          // Block number is 0 because it is important to receive all approval events,
          // so existing approvals will be reflected in the newly created pool
          '0',
        ),
      ]);
    }
  }

  async mint(dto: TokenMint): Promise<AsyncResponse> {
    const poolLocator = unpackPoolLocator(dto.poolLocator);
    const address = poolLocator.address ?? (await this.getContractAddress());
    const typeId = packTokenId(poolLocator.poolId);
    if (isFungible(poolLocator.poolId)) {
      const response = await this.blockchain.sendTransaction(
        dto.signer,
        address,
        dto.requestId,
        ERC1155MixedFungibleAbi.find(m => m.name === 'mintFungible'),
        [typeId, [dto.to], [dto.amount], encodeHex(dto.data ?? '')],
      );
      return { id: response.id };
    } else {
      // In the case of a non-fungible token:
      // - We parse the value as a whole integer count of NFTs to mint
      // - We require the number to be small enough to express as a JS number (we're packing into an array)
      const to: string[] = [];
      const amount = parseInt(dto.amount);
      for (let i = 0; i < amount; i++) {
        to.push(dto.to);
      }

      if (dto.uri !== undefined && (await this.isCustomUriSupported(address))) {
        const response = await this.blockchain.sendTransaction(
          dto.signer,
          address,
          dto.requestId,
          ERC1155MixedFungibleAbi.find(m => m.name === 'mintNonFungibleWithURI'),
          [typeId, to, encodeHex(dto.data ?? ''), dto.uri],
        );
        return { id: response.id };
      } else {
        const response = await this.blockchain.sendTransaction(
          dto.signer,
          address,
          dto.requestId,
          ERC1155MixedFungibleAbi.find(m => m.name === 'mintNonFungible'),
          [typeId, to, encodeHex(dto.data ?? '')],
        );
        return { id: response.id };
      }
    }
  }

  async approval(dto: TokenApproval): Promise<AsyncResponse> {
    const poolLocator = unpackPoolLocator(dto.poolLocator);
    const address = poolLocator.address ?? (await this.getContractAddress());
    const response = await this.blockchain.sendTransaction(
      dto.signer,
      address,
      dto.requestId,
      ERC1155MixedFungibleAbi.find(m => m.name === 'setApprovalForAllWithData'),
      [dto.operator, dto.approved, encodeHex(dto.data ?? '')],
    );
    return { id: response.id };
  }

  async transfer(dto: TokenTransfer): Promise<AsyncResponse> {
    const poolLocator = unpackPoolLocator(dto.poolLocator);
    const address = poolLocator.address ?? (await this.getContractAddress());
    const response = await this.blockchain.sendTransaction(
      dto.signer,
      address,
      dto.requestId,
      ERC1155MixedFungibleAbi.find(m => m.name === 'safeTransferFrom'),
      [
        dto.from,
        dto.to,
        packTokenId(poolLocator.poolId, dto.tokenIndex),
        dto.amount,
        encodeHex(dto.data ?? ''),
      ],
    );
    return { id: response.id };
  }

  async burn(dto: TokenBurn): Promise<AsyncResponse> {
    const poolLocator = unpackPoolLocator(dto.poolLocator);
    const address = poolLocator.address ?? (await this.getContractAddress());
    const response = await this.blockchain.sendTransaction(
      dto.signer,
      address,
      dto.requestId,
      ERC1155MixedFungibleAbi.find(m => m.name === 'burn'),
      [
        dto.from,
        packTokenId(poolLocator.poolId, dto.tokenIndex),
        dto.amount,
        encodeHex(dto.data ?? ''),
      ],
    );

    return { id: response.id };
  }

  async balance(dto: TokenBalanceQuery): Promise<TokenBalance> {
    const poolLocator = unpackPoolLocator(dto.poolLocator);
    const address = poolLocator.address ?? (await this.getContractAddress());
    const response = await this.blockchain.query(
      address,
      ERC1155MixedFungibleAbi.find(m => m.name === 'balanceOf'),
      [dto.account, packTokenId(poolLocator.poolId, dto.tokenIndex)],
    );
    return { balance: response.output };
  }
}
