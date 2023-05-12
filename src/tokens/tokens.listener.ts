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

import { Logger } from '@nestjs/common';
import { Event } from '../event-stream/event-stream.interfaces';
import { EventListener, EventProcessor } from '../eventstream-proxy/eventstream-proxy.interfaces';
import { WebSocketMessage } from '../websocket-events/websocket-events.base';
import { Context, newContext } from '../request-context/request-context.decorator';
import {
  ApprovalForAllEvent,
  TokenApprovalEvent,
  TokenBurnEvent,
  TokenPoolCreationEvent,
  TokenMintEvent,
  TokenPoolEvent,
  TokenTransferEvent,
  TokenType,
  TransferBatchEvent,
  TransferSingleEvent,
  TokenPoolEventInfo,
  InterfaceFormat,
} from './tokens.interfaces';
import {
  computeTokenIndex,
  decodeHex,
  encodeHexIDForURI,
  packPoolLocator,
  poolContainsId,
  unpackPoolLocator,
  unpackSubscriptionName,
  unpackTypeId,
} from './tokens.util';
import { BASE_SUBSCRIPTION_NAME } from './tokens.service';
import { BlockchainConnectorService } from './blockchain.service';
import { URI } from './erc1155';

const TOKEN_STANDARD = 'ERC1155';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const tokenCreateEventSignatureOld = 'TokenCreate(address,uint256,bytes)';
const tokenCreateEventSignature = 'TokenPoolCreation(address,uint256,bytes)';
const transferSingleEventSignature = 'TransferSingle(address,address,address,uint256,uint256)';
const transferBatchEventSignature = 'TransferBatch(address,address,address,uint256[],uint256[])';
const approvalForAllEventSignature = 'ApprovalForAll(address,address,bool)';

export class TokenListener implements EventListener {
  private readonly logger = new Logger(TokenListener.name);

  constructor(private blockchain: BlockchainConnectorService) {}

  async onEvent(subName: string, event: Event, process: EventProcessor) {
    switch (this.trimEventSignature(event.signature)) {
      case tokenCreateEventSignatureOld:
      case tokenCreateEventSignature:
        process(this.transformTokenPoolCreationEvent(subName, event));
        break;
      case transferSingleEventSignature:
        process(await this.transformTransferSingleEvent(newContext(), subName, event));
        break;
      case approvalForAllEventSignature:
        process(this.transformApprovalForAllEvent(subName, event));
        break;
      case transferBatchEventSignature:
        for (const msg of await this.transformTransferBatchEvent(newContext(), subName, event)) {
          process(msg);
        }
        break;
      default:
        this.logger.error(`Unknown event signature: ${event.signature}`);
        return undefined;
    }
  }

  /**
   * Generate an event ID in the recognized FireFly format for Ethereum
   * (zero-padded block number, transaction index, and log index)
   */
  private formatBlockchainEventId(event: Event) {
    const blockNumber = event.blockNumber ?? '0';
    const txIndex = BigInt(event.transactionIndex).toString(10);
    const logIndex = event.logIndex ?? '0';
    return [
      blockNumber.padStart(12, '0'),
      txIndex.padStart(6, '0'),
      logIndex.padStart(6, '0'),
    ].join('/');
  }

  private stripParamsFromSignature(signature: string) {
    return signature.substring(0, signature.indexOf('('));
  }

  private trimEventSignature(signature: string) {
    const firstColon = signature.indexOf(':');
    if (firstColon > 0) {
      return signature.substring(firstColon + 1);
    }
    return signature;
  }

  private transformTokenPoolCreationEvent(
    subName: string,
    event: TokenPoolCreationEvent,
  ): WebSocketMessage | undefined {
    const { data: output } = event;
    const unpackedSub = unpackSubscriptionName(subName);
    const decodedData = decodeHex(output.data ?? '');

    if (unpackedSub.poolLocator === undefined) {
      // should not happen
      return undefined;
    }

    let packedPoolLocator = unpackedSub.poolLocator;
    let isFungible: boolean;
    if (packedPoolLocator === BASE_SUBSCRIPTION_NAME) {
      const unpackedId = unpackTypeId(output.type_id);
      isFungible = unpackedId.isFungible;
      packedPoolLocator = packPoolLocator(
        event.address.toLowerCase(),
        isFungible,
        unpackedId.startId,
        unpackedId.endId,
        event.blockNumber,
      );
    } else {
      const poolLocator = unpackPoolLocator(packedPoolLocator);
      if (!poolContainsId(poolLocator, output.type_id)) {
        // this is a pool-specific subscription, and this event is not from the subscribed pool
        return undefined;
      }
      isFungible = poolLocator.isFungible;
    }

    const eventInfo: TokenPoolEventInfo = {
      address: event.address,
      typeId: '0x' + encodeHexIDForURI(output.type_id),
    };

    return {
      event: 'token-pool',
      data: <TokenPoolEvent>{
        standard: TOKEN_STANDARD,
        interfaceFormat: InterfaceFormat.ABI,
        poolData: unpackedSub.poolData,
        poolLocator: packedPoolLocator,
        type: isFungible ? TokenType.FUNGIBLE : TokenType.NONFUNGIBLE,
        signer: output.operator,
        data: decodedData,
        info: eventInfo,
        blockchain: {
          id: this.formatBlockchainEventId(event),
          name: this.stripParamsFromSignature(this.trimEventSignature(event.signature)),
          location: 'address=' + event.address,
          signature: this.trimEventSignature(event.signature),
          timestamp: event.timestamp,
          output,
          info: {
            blockNumber: event.blockNumber,
            transactionIndex: event.transactionIndex,
            transactionHash: event.transactionHash,
            logIndex: event.logIndex,
            address: event.address,
            signature: this.trimEventSignature(event.signature),
          },
        },
      },
    };
  }

  private async transformTransferSingleEvent(
    ctx: Context,
    subName: string,
    event: TransferSingleEvent,
    eventIndex?: number,
  ): Promise<WebSocketMessage | undefined> {
    const { data: output } = event;
    const unpackedSub = unpackSubscriptionName(subName);
    const decodedData = decodeHex(event.inputArgs?.data ?? '');

    if (unpackedSub.poolLocator === undefined) {
      // should not happen
      return undefined;
    }

    const poolLocator = unpackPoolLocator(unpackedSub.poolLocator);
    if (!poolContainsId(poolLocator, output.id)) {
      // this transfer is not from the subscribed pool
      return undefined;
    }
    if (output.from === ZERO_ADDRESS && output.to === ZERO_ADDRESS) {
      // should not happen
      return undefined;
    }

    const tokenIndex = poolLocator.isFungible
      ? undefined
      : computeTokenIndex(poolLocator, output.id);
    const uri = poolLocator.isFungible
      ? undefined
      : await this.getTokenUri(ctx, event.address, output.id);
    const eventId = this.formatBlockchainEventId(event);
    const transferId =
      eventIndex === undefined ? eventId : eventId + '/' + eventIndex.toString(10).padStart(6, '0');

    const commonData = <TokenTransferEvent>{
      id: transferId,
      poolData: unpackedSub.poolData,
      poolLocator: unpackedSub.poolLocator,
      tokenIndex,
      uri,
      amount: output.value,
      signer: output.operator,
      data: decodedData,
      blockchain: {
        id: eventId,
        name: this.stripParamsFromSignature(this.trimEventSignature(event.signature)),
        location: 'address=' + event.address,
        signature: this.trimEventSignature(event.signature),
        timestamp: event.timestamp,
        output,
        info: {
          blockNumber: event.blockNumber,
          transactionIndex: event.transactionIndex,
          transactionHash: event.transactionHash,
          logIndex: event.logIndex,
          address: event.address,
          signature: this.trimEventSignature(event.signature),
        },
      },
    };

    if (output.from === ZERO_ADDRESS) {
      return {
        event: 'token-mint',
        data: <TokenMintEvent>{ ...commonData, to: output.to },
      };
    } else if (output.to === ZERO_ADDRESS) {
      return {
        event: 'token-burn',
        data: <TokenBurnEvent>{ ...commonData, from: output.from },
      };
    } else {
      return {
        event: 'token-transfer',
        data: <TokenTransferEvent>{ ...commonData, from: output.from, to: output.to },
      };
    }
  }

  private async transformTransferBatchEvent(
    ctx: Context,
    subName: string,
    event: TransferBatchEvent,
  ): Promise<WebSocketMessage[]> {
    const messages: WebSocketMessage[] = [];
    for (let i = 0; i < event.data.ids.length; i++) {
      const message = await this.transformTransferSingleEvent(
        ctx,
        subName,
        {
          ...event,
          data: {
            from: event.data.from,
            to: event.data.to,
            operator: event.data.operator,
            id: event.data.ids[i],
            value: event.data.values[i],
          },
        },
        i,
      );
      if (message !== undefined) {
        messages.push(message);
      }
    }
    return messages;
  }

  private transformApprovalForAllEvent(
    subName: string,
    event: ApprovalForAllEvent,
  ): WebSocketMessage | undefined {
    const { data: output } = event;
    const unpackedSub = unpackSubscriptionName(subName);
    const decodedData = decodeHex(event.inputArgs?.data ?? '');

    if (unpackedSub.poolLocator === undefined) {
      // should not happen
      return undefined;
    }
    const poolLocator = unpackPoolLocator(unpackedSub.poolLocator);

    // One event may apply across multiple pools
    // Include the pool startId to generate a unique approvalId per pool
    const eventId = this.formatBlockchainEventId(event);
    const approvalId = eventId + '/' + poolLocator.startId;

    return {
      event: 'token-approval',
      data: <TokenApprovalEvent>{
        id: approvalId,
        poolData: unpackedSub.poolData,
        subject: `${output.account}:${output.operator}`,
        poolLocator: unpackedSub.poolLocator,
        operator: output.operator,
        approved: output.approved,
        signer: output.account,
        data: decodedData,
        blockchain: {
          id: eventId,
          name: this.stripParamsFromSignature(this.trimEventSignature(event.signature)),
          location: 'address=' + event.address,
          signature: this.trimEventSignature(event.signature),
          timestamp: event.timestamp,
          output,
          info: {
            blockNumber: event.blockNumber,
            transactionIndex: event.transactionIndex,
            transactionHash: event.transactionHash,
            logIndex: event.logIndex,
            address: event.address,
            signature: this.trimEventSignature(event.signature),
          },
        },
      },
    };
  }

  private async getTokenUri(ctx: Context, address: string, id: string): Promise<string> {
    try {
      const response = await this.blockchain.query(ctx, address, URI, [id]);
      const output = response.output as string;
      if (output.includes('{id}') === true) {
        return output.replace('{id}', encodeHexIDForURI(id));
      }
      return output;
    } catch (err) {
      this.logger.log(`Could not query token URI: ${err}`);
      return '';
    }
  }
}
