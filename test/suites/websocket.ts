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

import {
  EventStreamReply,
  EventStreamSubscription,
} from '../../src/event-stream/event-stream.interfaces';
import {
  ApprovalForAllEvent,
  EthConnectReturn,
  TokenApprovalEvent,
  TokenBurnEvent,
  TokenPoolCreationEvent,
  TokenMintEvent,
  TokenPoolEvent,
  TokenTransferEvent,
  TransferBatchEvent,
  TransferSingleEvent,
} from '../../src/tokens/tokens.interfaces';
import { WebSocketMessage } from '../../src/websocket-events/websocket-events.base';
import { packSubscriptionName } from '../../src/tokens/tokens.util';
import { BASE_URL, FakeObservable, TestContext } from '../app.e2e-context';
import { abi as ERC1155MixedFungibleAbi } from '../../src/abi/ERC1155MixedFungible.json';
const queryHeader = 'Query';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const OPTIONS = {
  headers: {
    'x-firefly-request-id': expect.any(String),
  },
};

const tokenCreateEventSignatureOld = 'TokenCreate(address,uint256,bytes)';
const tokenCreateEventSignature = 'TokenPoolCreation(address,uint256,bytes)';
const transferSingleEventSignature = 'TransferSingle(address,address,address,uint256,uint256)';
const approvalForAllEventSignature = 'ApprovalForAll(address,address,bool)';
const transferBatchEventSignature = 'TransferBatch(address,address,address,uint256[],uint256[])';

export default (context: TestContext) => {
  it('Token pool event', () => {
    context.eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName('0x123', 'F1', '', 'default'),
    });

    return context.server
      .ws('/api/ws')
      .sendJson({
        type: 'start',
        namespace: 'ns1',
      })
      .exec(async () => {
        await context.connected;
        expect(context.eventHandler).toBeDefined();
        context.eventHandler({
          events: [
            <TokenPoolCreationEvent>{
              subId: 'sb123',
              signature: tokenCreateEventSignature,
              address: '0x00001',
              blockNumber: '1',
              transactionIndex: '0x0',
              transactionHash: '0x123',
              timestamp: '2020-01-01 00:00:00Z',
              data: {
                operator: 'bob',
                type_id: '340282366920938463463374607431768211456',
                data: '0x00',
              },
            },
          ],
        });
      })
      .expectJson(message => {
        expect(message.event).toEqual('started');
        expect(message.data.namespace).toEqual('ns1');
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        expect(message.event).toEqual('batch');
        expect(message.data.events).toHaveLength(1);
        expect(message.data.events[0]).toEqual(<WebSocketMessage>{
          event: 'token-pool',
          data: <TokenPoolEvent>{
            standard: 'ERC1155',
            interfaceFormat: 'abi',
            poolData: 'default',
            poolLocator: 'F1',
            alternateLocators: <string[]>[],
            type: 'fungible',
            signer: 'bob',
            data: '',
            info: {
              address: '0x00001',
              startId: '0x100000000000000000000000000000000',
              endId: '0x100000000000000000000000000000000',
            },
            blockchain: {
              id: '000000000001/000000/000000',
              name: 'TokenPoolCreation',
              location: 'address=0x00001',
              signature: tokenCreateEventSignature,
              timestamp: '2020-01-01 00:00:00Z',
              output: {
                operator: 'bob',
                type_id: '340282366920938463463374607431768211456',
                data: '0x00',
              },
              info: {
                address: '0x00001',
                blockNumber: '1',
                transactionIndex: '0x0',
                transactionHash: '0x123',
                signature: tokenCreateEventSignature,
              },
            },
          },
        });
        return true;
      });
  });

  it('Token pool event from base subscription', () => {
    context.eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName('0x123', 'base', ''),
    });

    return context.server
      .ws('/api/ws')
      .sendJson({
        type: 'start',
        namespace: 'ns1',
      })
      .exec(async () => {
        await context.connected;
        expect(context.eventHandler).toBeDefined();
        context.eventHandler({
          events: [
            <TokenPoolCreationEvent>{
              subId: 'sb123',
              signature: tokenCreateEventSignature,
              address: '0x00001',
              blockNumber: '1',
              transactionIndex: '0x0',
              transactionHash: '0x123',
              timestamp: '2020-01-01 00:00:00Z',
              data: {
                operator: 'bob',
                type_id: '340282366920938463463374607431768211456',
                data: '0x00',
              },
            },
          ],
        });
      })
      .expectJson(message => {
        expect(message.event).toEqual('started');
        expect(message.data.namespace).toEqual('ns1');
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        expect(message.event).toEqual('batch');
        expect(message.data.events).toHaveLength(1);
        expect(message.data.events[0]).toEqual(<WebSocketMessage>{
          event: 'token-pool',
          data: <TokenPoolEvent>{
            standard: 'ERC1155',
            interfaceFormat: 'abi',
            poolLocator:
              'address=0x00001&type=fungible&startId=0x100000000000000000000000000000000&endId=0x100000000000000000000000000000000&block=1',
            alternateLocators: ['address=0x00001&id=F1&block=1'],
            type: 'fungible',
            signer: 'bob',
            data: '',
            info: {
              address: '0x00001',
              startId: '0x100000000000000000000000000000000',
              endId: '0x100000000000000000000000000000000',
            },
            blockchain: {
              id: '000000000001/000000/000000',
              name: 'TokenPoolCreation',
              location: 'address=0x00001',
              signature: tokenCreateEventSignature,
              timestamp: '2020-01-01 00:00:00Z',
              output: {
                operator: 'bob',
                type_id: '340282366920938463463374607431768211456',
                data: '0x00',
              },
              info: {
                address: '0x00001',
                blockNumber: '1',
                transactionIndex: '0x0',
                transactionHash: '0x123',
                signature: tokenCreateEventSignature,
              },
            },
          },
        });
        return true;
      });
  });

  it('Token pool event with old signature', () => {
    context.eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName('0x123', 'base', '', 'default'),
    });

    return context.server
      .ws('/api/ws')
      .sendJson({
        type: 'start',
        namespace: 'ns1',
      })
      .exec(async () => {
        await context.connected;
        expect(context.eventHandler).toBeDefined();
        context.eventHandler({
          events: [
            <TokenPoolCreationEvent>{
              subId: 'sb123',
              signature: tokenCreateEventSignatureOld,
              address: '0x00001',
              blockNumber: '1',
              transactionIndex: '0x0',
              transactionHash: '0x123',
              timestamp: '2020-01-01 00:00:00Z',
              data: {
                operator: 'bob',
                type_id: '340282366920938463463374607431768211456',
                data: '0x00',
              },
            },
          ],
        });
      })
      .expectJson(message => {
        expect(message.event).toEqual('started');
        expect(message.data.namespace).toEqual('ns1');
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        expect(message.event).toEqual('batch');
        expect(message.data.events).toHaveLength(1);
        expect(message.data.events[0]).toEqual(<WebSocketMessage>{
          event: 'token-pool',
          data: <TokenPoolEvent>{
            standard: 'ERC1155',
            interfaceFormat: 'abi',
            poolData: 'default',
            poolLocator:
              'address=0x00001&type=fungible&startId=0x100000000000000000000000000000000&endId=0x100000000000000000000000000000000&block=1',
            alternateLocators: ['address=0x00001&id=F1&block=1'],
            type: 'fungible',
            signer: 'bob',
            data: '',
            info: {
              address: '0x00001',
              startId: '0x100000000000000000000000000000000',
              endId: '0x100000000000000000000000000000000',
            },
            blockchain: {
              id: '000000000001/000000/000000',
              name: 'TokenCreate',
              location: 'address=0x00001',
              signature: tokenCreateEventSignatureOld,
              timestamp: '2020-01-01 00:00:00Z',
              output: {
                operator: 'bob',
                type_id: '340282366920938463463374607431768211456',
                data: '0x00',
              },
              info: {
                address: '0x00001',
                blockNumber: '1',
                transactionIndex: '0x0',
                transactionHash: '0x123',
                signature: tokenCreateEventSignatureOld,
              },
            },
          },
        });
        return true;
      });
  });

  it('Token mint event', async () => {
    context.eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName('0x123', 'id=F1&block=1', '', 'default'),
    });

    await context.server
      .ws('/api/ws')
      .sendJson({
        type: 'start',
        namespace: 'ns1',
      })
      .exec(async () => {
        await context.connected;
        expect(context.eventHandler).toBeDefined();
        context.eventHandler({
          events: [
            <TransferSingleEvent>{
              subId: 'sb-123',
              signature: transferSingleEventSignature,
              address: '0x00001',
              blockNumber: '1',
              transactionIndex: '0x0',
              transactionHash: '0x123',
              logIndex: '1',
              timestamp: '2020-01-01 00:00:00Z',
              data: {
                id: '340282366920938463463374607431768211456',
                from: ZERO_ADDRESS,
                to: 'A',
                operator: 'A',
                value: '5',
                transaction: {
                  blockNumber: '1',
                  transactionIndex: '0x0',
                  transactionHash: '0x123',
                  logIndex: '1',
                },
              },
              inputMethod: 'mintFungible',
              inputArgs: {
                data: '0x74657374',
              },
            },
          ],
        });
      })
      .expectJson(message => {
        expect(message.event).toEqual('started');
        expect(message.data.namespace).toEqual('ns1');
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        expect(message.event).toEqual('batch');
        expect(message.data.events).toHaveLength(1);
        expect(message.data.events[0]).toEqual(<WebSocketMessage>{
          event: 'token-mint',
          data: <TokenMintEvent>{
            id: '000000000001/000000/000001',
            poolData: 'default',
            poolLocator: 'id=F1&block=1',
            to: 'A',
            amount: '5',
            signer: 'A',
            data: 'test',
            blockchain: {
              id: '000000000001/000000/000001',
              name: 'TransferSingle',
              location: 'address=0x00001',
              signature: transferSingleEventSignature,
              timestamp: '2020-01-01 00:00:00Z',
              output: {
                id: '340282366920938463463374607431768211456',
                from: ZERO_ADDRESS,
                to: 'A',
                operator: 'A',
                value: '5',
                transaction: {
                  blockNumber: '1',
                  transactionIndex: '0x0',
                  transactionHash: '0x123',
                  logIndex: '1',
                },
              },
              info: {
                address: '0x00001',
                blockNumber: '1',
                transactionIndex: '0x0',
                transactionHash: '0x123',
                logIndex: '1',
                signature: transferSingleEventSignature,
              },
            },
          },
        });
        return true;
      });
  });

  it('Token mint event with old pool ID', async () => {
    context.eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName('0x123', 'N1', '', 'default'),
    });

    context.http.post = jest.fn(
      () =>
        new FakeObservable(<EthConnectReturn>{
          output: 'firefly://token/{id}',
        }),
    );

    await context.server
      .ws('/api/ws')
      .sendJson({
        type: 'start',
        namespace: 'ns1',
      })
      .exec(async () => {
        await context.connected;
        expect(context.eventHandler).toBeDefined();
        context.eventHandler({
          events: [
            <TransferSingleEvent>{
              subId: 'sb-123',
              signature: transferSingleEventSignature,
              address: '0x00001',
              blockNumber: '1',
              transactionIndex: '0x0',
              transactionHash: '0x123',
              logIndex: '1',
              timestamp: '2020-01-01 00:00:00Z',
              data: {
                id: '57896044618658097711785492504343953926975274699741220483192166611388333031425',
                from: ZERO_ADDRESS,
                to: 'A',
                operator: 'A',
                value: '5',
                transaction: {
                  blockNumber: '1',
                  transactionIndex: '0x0',
                  transactionHash: '0x123',
                  logIndex: '1',
                },
              },
              inputMethod: 'mintFungible',
              inputArgs: {
                data: '0x74657374',
              },
            },
          ],
        });
      })
      .expectJson(message => {
        expect(message.event).toEqual('started');
        expect(message.data.namespace).toEqual('ns1');
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        expect(message.event).toEqual('batch');
        expect(message.data.events).toHaveLength(1);
        expect(message.data.events[0]).toEqual(<WebSocketMessage>{
          event: 'token-mint',
          data: <TokenMintEvent>{
            id: '000000000001/000000/000001',
            poolData: 'default',
            poolLocator: 'N1',
            tokenIndex: '1',
            to: 'A',
            amount: '5',
            signer: 'A',
            uri: 'firefly://token/8000000000000000000000000000000100000000000000000000000000000001',
            data: 'test',
            blockchain: {
              id: '000000000001/000000/000001',
              name: 'TransferSingle',
              location: 'address=0x00001',
              signature: transferSingleEventSignature,
              timestamp: '2020-01-01 00:00:00Z',
              output: {
                id: '57896044618658097711785492504343953926975274699741220483192166611388333031425',
                from: ZERO_ADDRESS,
                to: 'A',
                operator: 'A',
                value: '5',
                transaction: {
                  blockNumber: '1',
                  transactionIndex: '0x0',
                  transactionHash: '0x123',
                  logIndex: '1',
                },
              },
              info: {
                address: '0x00001',
                blockNumber: '1',
                transactionIndex: '0x0',
                transactionHash: '0x123',
                logIndex: '1',
                signature: transferSingleEventSignature,
              },
            },
          },
        });
        return true;
      });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
      `${BASE_URL}`,
      {
        headers: {
          type: queryHeader,
        },
        to: '0x00001',
        method: ERC1155MixedFungibleAbi.find(m => m.name === 'uri'),
        params: ['57896044618658097711785492504343953926975274699741220483192166611388333031425'],
      },
      OPTIONS,
    );
  });

  it('Token burn event', async () => {
    context.eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName('0x123', 'id=N1&block=1', '', 'default'),
    });

    context.http.post = jest.fn(
      () =>
        new FakeObservable(<EthConnectReturn>{
          output: 'firefly://token/{id}',
        }),
    );

    await context.server
      .ws('/api/ws')
      .sendJson({
        type: 'start',
        namespace: 'ns1',
      })
      .exec(async () => {
        await context.connected;
        expect(context.eventHandler).toBeDefined();
        context.eventHandler({
          events: [
            <TransferSingleEvent>{
              subId: 'sb-123',
              signature: transferSingleEventSignature,
              address: '0x00001',
              blockNumber: '1',
              transactionIndex: '0x0',
              transactionHash: '0x123',
              logIndex: '1',
              timestamp: '2020-01-01 00:00:00Z',
              data: {
                id: '57896044618658097711785492504343953926975274699741220483192166611388333031425',
                from: 'A',
                to: ZERO_ADDRESS,
                operator: 'A',
                value: '1',
                transaction: {
                  blockNumber: '1',
                  transactionIndex: '0x0',
                  transactionHash: '0x123',
                },
              },
              inputMethod: 'burn',
              inputArgs: {
                data: '0x74657374',
              },
            },
          ],
        });
      })
      .expectJson(message => {
        expect(message.event).toEqual('started');
        expect(message.data.namespace).toEqual('ns1');
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        expect(message.event).toEqual('batch');
        expect(message.data.events).toHaveLength(1);
        expect(message.data.events[0]).toEqual(<WebSocketMessage>{
          event: 'token-burn',
          data: <TokenBurnEvent>{
            id: '000000000001/000000/000001',
            poolData: 'default',
            poolLocator: 'id=N1&block=1',
            tokenIndex: '1',
            from: 'A',
            amount: '1',
            signer: 'A',
            uri: 'firefly://token/8000000000000000000000000000000100000000000000000000000000000001',
            data: 'test',
            blockchain: {
              id: '000000000001/000000/000001',
              name: 'TransferSingle',
              location: 'address=0x00001',
              signature: transferSingleEventSignature,
              timestamp: '2020-01-01 00:00:00Z',
              output: {
                id: '57896044618658097711785492504343953926975274699741220483192166611388333031425',
                from: 'A',
                to: ZERO_ADDRESS,
                operator: 'A',
                value: '1',
                transaction: {
                  blockNumber: '1',
                  transactionIndex: '0x0',
                  transactionHash: '0x123',
                },
              },
              info: {
                address: '0x00001',
                blockNumber: '1',
                transactionIndex: '0x0',
                transactionHash: '0x123',
                logIndex: '1',
                signature: transferSingleEventSignature,
              },
            },
          },
        });
        return true;
      });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
      `${BASE_URL}`,
      {
        headers: {
          type: queryHeader,
        },
        to: '0x00001',
        method: ERC1155MixedFungibleAbi.find(m => m.name === 'uri'),
        params: ['57896044618658097711785492504343953926975274699741220483192166611388333031425'],
      },
      OPTIONS,
    );
  });

  it('Token transfer event', async () => {
    context.eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName('0x123', 'id=N1&block=1', '', 'default'),
    });

    context.http.post = jest.fn(
      () =>
        new FakeObservable(<EthConnectReturn>{
          output: 'firefly://token/{id}',
        }),
    );

    await context.server
      .ws('/api/ws')
      .sendJson({
        type: 'start',
        namespace: 'ns1',
      })
      .exec(async () => {
        await context.connected;
        expect(context.eventHandler).toBeDefined();
        context.eventHandler({
          events: [
            <TransferSingleEvent>{
              subId: 'sb123',
              signature: transferSingleEventSignature,
              address: '0x00001',
              blockNumber: '1',
              transactionIndex: '0x0',
              transactionHash: '0x123',
              logIndex: '1',
              timestamp: '2020-01-01 00:00:00Z',
              data: {
                id: '57896044618658097711785492504343953926975274699741220483192166611388333031425',
                from: 'A',
                to: 'B',
                operator: 'A',
                value: '1',
              },
            },
          ],
        });
      })
      .expectJson(message => {
        expect(message.event).toEqual('started');
        expect(message.data.namespace).toEqual('ns1');
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        expect(message.event).toEqual('batch');
        expect(message.data.events).toHaveLength(1);
        expect(message.data.events[0]).toEqual(<WebSocketMessage>{
          event: 'token-transfer',
          data: <TokenTransferEvent>{
            id: '000000000001/000000/000001',
            poolData: 'default',
            poolLocator: 'id=N1&block=1',
            tokenIndex: '1',
            from: 'A',
            to: 'B',
            amount: '1',
            signer: 'A',
            uri: 'firefly://token/8000000000000000000000000000000100000000000000000000000000000001',
            data: '',
            blockchain: {
              id: '000000000001/000000/000001',
              name: 'TransferSingle',
              location: 'address=0x00001',
              signature: transferSingleEventSignature,
              timestamp: '2020-01-01 00:00:00Z',
              output: {
                id: '57896044618658097711785492504343953926975274699741220483192166611388333031425',
                from: 'A',
                to: 'B',
                operator: 'A',
                value: '1',
              },
              info: {
                address: '0x00001',
                blockNumber: '1',
                transactionIndex: '0x0',
                transactionHash: '0x123',
                logIndex: '1',
                signature: transferSingleEventSignature,
              },
            },
          },
        });
        return true;
      });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
      `${BASE_URL}`,
      {
        headers: {
          type: queryHeader,
        },
        to: '0x00001',
        method: ERC1155MixedFungibleAbi.find(m => m.name === 'uri'),
        params: ['57896044618658097711785492504343953926975274699741220483192166611388333031425'],
      },
      OPTIONS,
    );
  });

  it('Token approval event', async () => {
    context.eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName('0x123', 'id=N1&block=1', '', 'default'),
    });

    await context.server
      .ws('/api/ws')
      .sendJson({
        type: 'start',
        namespace: 'ns1',
      })
      .exec(async () => {
        await context.connected;
        expect(context.eventHandler).toBeDefined();
        context.eventHandler({
          events: [
            <ApprovalForAllEvent>{
              signature: approvalForAllEventSignature,
              address: '0x00001',
              blockNumber: '1',
              transactionIndex: '0x0',
              transactionHash: '0x123',
              logIndex: '1',
              timestamp: '2020-01-01 00:00:00Z',
              data: {
                account: 'A',
                approved: true,
                operator: 'B',
                data: '1',
              },
            },
          ],
        });
      })
      .expectJson(message => {
        expect(message.event).toEqual('started');
        expect(message.data.namespace).toEqual('ns1');
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        expect(message.event).toEqual('batch');
        expect(message.data.events).toHaveLength(1);
        expect(message.data.events[0]).toEqual(<WebSocketMessage>{
          event: 'token-approval',
          data: <TokenApprovalEvent>{
            id: '000000000001/000000/000001/0x8000000000000000000000000000000100000000000000000000000000000000',
            poolData: 'default',
            subject: 'A:B',
            signer: 'A',
            operator: 'B',
            poolLocator: 'id=N1&block=1',
            approved: true,
            data: '',
            blockchain: {
              id: '000000000001/000000/000001',
              name: 'ApprovalForAll',
              location: 'address=0x00001',
              signature: approvalForAllEventSignature,
              timestamp: '2020-01-01 00:00:00Z',
              output: {
                account: 'A',
                approved: true,
                operator: 'B',
                data: '1',
              },
              info: {
                address: '0x00001',
                blockNumber: '1',
                transactionIndex: '0x0',
                transactionHash: '0x123',
                logIndex: '1',
                signature: approvalForAllEventSignature,
              },
            },
          },
        });
        return true;
      });
  });

  it('Token transfer event from wrong pool', () => {
    const sub = <EventStreamSubscription>{
      name: packSubscriptionName('0x123', 'id=N1&block=1', '', 'default'),
    };
    context.eventstream.getSubscription.mockReturnValueOnce(sub).mockReturnValueOnce(sub);

    return context.server
      .ws('/api/ws')
      .sendJson({
        type: 'start',
        namespace: 'ns1',
      })
      .exec(async () => {
        await context.connected;
        expect(context.eventHandler).toBeDefined();
        context.eventHandler({
          events: [
            <TransferSingleEvent>{
              subId: 'sb123',
              signature: transferSingleEventSignature,
              address: '',
              blockNumber: '1',
              transactionIndex: '0x0',
              transactionHash: '0x123',
              data: {
                id: '340282366920938463463374607431768211456',
                from: 'A',
                to: 'B',
                operator: 'A',
                value: '1',
              },
            },
            <TransferSingleEvent>{
              subId: 'sb123',
              signature: transferSingleEventSignature,
              address: '',
              blockNumber: '2',
              transactionIndex: '0x0',
              transactionHash: '0x123',
              data: {
                id: '57896044618658097711785492504343953926975274699741220483192166611388333031425',
                from: 'A',
                to: 'B',
                operator: 'A',
                value: '1',
              },
            },
          ],
        });
      })
      .expectJson(message => {
        expect(message.event).toEqual('started');
        expect(message.data.namespace).toEqual('ns1');
      })
      .expectJson(message => {
        // Only the second transfer should have been processed
        expect(message.event).toEqual('batch');
        expect(message.data.events).toHaveLength(1);
        expect(message.data.events[0].event).toEqual('token-transfer');
        expect(message.data.events[0].data.poolLocator).toEqual('id=N1&block=1');
        expect(message.data.events[0].data.blockchain.info.blockNumber).toEqual('2');
        return true;
      });
  });

  it('Token batch transfer', async () => {
    context.eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName('0x123', 'N1', '', 'default'),
    });

    context.http.post = jest.fn(
      () =>
        new FakeObservable(<EthConnectReturn>{
          output: 'firefly://token/{id}',
        }),
    );

    await context.server
      .ws('/api/ws')
      .sendJson({
        type: 'start',
        namespace: 'ns1',
      })
      .exec(async () => {
        await context.connected;
        expect(context.eventHandler).toBeDefined();
        context.eventHandler({
          events: [
            <TransferBatchEvent>{
              subId: 'sb123',
              signature: transferBatchEventSignature,
              address: '0x00001',
              blockNumber: '1',
              transactionIndex: '0x0',
              transactionHash: '0x123',
              logIndex: '1',
              timestamp: '2020-01-01 00:00:00Z',
              data: {
                from: 'A',
                to: 'B',
                operator: 'A',
                ids: [
                  '57896044618658097711785492504343953926975274699741220483192166611388333031425',
                  '57896044618658097711785492504343953926975274699741220483192166611388333031426',
                ],
                values: ['1', '1'],
              },
            },
          ],
        });
      })
      .expectJson(message => {
        expect(message.event).toEqual('started');
        expect(message.data.namespace).toEqual('ns1');
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        expect(message.event).toEqual('batch');
        expect(message.data.events).toHaveLength(2);
        expect(message.data.events[0]).toEqual(<WebSocketMessage>{
          event: 'token-transfer',
          data: <TokenTransferEvent>{
            id: '000000000001/000000/000001/000000',
            poolData: 'default',
            poolLocator: 'N1',
            tokenIndex: '1',
            from: 'A',
            to: 'B',
            amount: '1',
            signer: 'A',
            uri: 'firefly://token/8000000000000000000000000000000100000000000000000000000000000001',
            data: '',
            blockchain: {
              id: '000000000001/000000/000001',
              name: 'TransferBatch',
              location: 'address=0x00001',
              signature: transferBatchEventSignature,
              timestamp: '2020-01-01 00:00:00Z',
              output: {
                from: 'A',
                to: 'B',
                operator: 'A',
                id: '57896044618658097711785492504343953926975274699741220483192166611388333031425',
                value: '1',
              },
              info: {
                address: '0x00001',
                blockNumber: '1',
                transactionIndex: '0x0',
                transactionHash: '0x123',
                logIndex: '1',
                signature: transferBatchEventSignature,
              },
            },
          },
        });
        expect(message.data.events[1]).toEqual(<WebSocketMessage>{
          event: 'token-transfer',
          data: <TokenTransferEvent>{
            id: '000000000001/000000/000001/000001',
            poolData: 'default',
            poolLocator: 'N1',
            tokenIndex: '2',
            from: 'A',
            to: 'B',
            amount: '1',
            signer: 'A',
            uri: 'firefly://token/8000000000000000000000000000000100000000000000000000000000000002',
            data: '',
            blockchain: {
              id: '000000000001/000000/000001',
              name: 'TransferBatch',
              location: 'address=0x00001',
              signature: transferBatchEventSignature,
              timestamp: '2020-01-01 00:00:00Z',
              output: {
                from: 'A',
                to: 'B',
                operator: 'A',
                id: '57896044618658097711785492504343953926975274699741220483192166611388333031426',
                value: '1',
              },
              info: {
                address: '0x00001',
                blockNumber: '1',
                transactionIndex: '0x0',
                transactionHash: '0x123',
                logIndex: '1',
                signature: transferBatchEventSignature,
              },
            },
          },
        });
        return true;
      });

    expect(context.http.post).toHaveBeenCalledTimes(2);
    expect(context.http.post).toHaveBeenCalledWith(
      `${BASE_URL}`,
      {
        headers: {
          type: queryHeader,
        },
        to: '0x00001',
        method: ERC1155MixedFungibleAbi.find(m => m.name === 'uri'),
        params: ['57896044618658097711785492504343953926975274699741220483192166611388333031426'],
      },
      OPTIONS,
    );
  });

  it('Success receipt', () => {
    return context.server
      .ws('/api/ws')
      .sendJson({
        type: 'start',
        namespace: 'ns1',
      })
      .exec(async () => {
        await context.connected;
        expect(context.receiptHandler).toBeDefined();
        context.receiptHandler(<EventStreamReply>{
          headers: {
            requestId: '1',
            type: 'TransactionSuccess',
          },
        });
      })
      .expectJson(message => {
        expect(message).toEqual(<WebSocketMessage>{
          event: 'receipt',
          data: <EventStreamReply>{
            headers: {
              requestId: '1',
              type: 'TransactionSuccess',
            },
          },
        });
        return true;
      });
  });

  it('Error receipt', () => {
    return context.server
      .ws('/api/ws')
      .sendJson({
        type: 'start',
        namespace: 'ns1',
      })
      .exec(async () => {
        await context.connected;
        expect(context.receiptHandler).toBeDefined();
        context.receiptHandler(<EventStreamReply>{
          headers: {
            requestId: '1',
            type: 'Error',
          },
          errorMessage: 'Failed',
        });
      })
      .expectJson(message => {
        expect(message).toEqual(<WebSocketMessage>{
          event: 'receipt',
          data: <EventStreamReply>{
            headers: {
              requestId: '1',
              type: 'Error',
            },
            errorMessage: 'Failed',
          },
        });
        return true;
      });
  });

  it('Disconnect and reconnect', async () => {
    const tokenPoolMessage: TokenPoolCreationEvent = {
      subId: 'sb-123',
      signature: tokenCreateEventSignature,
      address: '0x00001',
      blockNumber: '1',
      transactionIndex: '0x0',
      transactionHash: '0x123',
      logIndex: '1',
      timestamp: '2020-01-01 00:00:00Z',
      data: {
        operator: 'bob',
        type_id: '340282366920938463463374607431768211456',
        data: '0x6e73006e616d65006964',
      },
    };

    context.eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName('0x123', 'id=F1&block=1', '', 'default'),
    });

    await context.server
      .ws('/api/ws')
      .sendJson({
        type: 'start',
        namespace: 'ns1',
      })
      .exec(async () => {
        await context.connected;
        expect(context.eventHandler).toBeDefined();
        context.eventHandler({ events: [tokenPoolMessage] });
      })
      .expectJson(message => {
        expect(message.event).toEqual('started');
        expect(message.data.namespace).toEqual('ns1');
      })
      .expectJson(message => {
        expect(message.event).toEqual('batch');
        expect(message.data.events).toHaveLength(1);
        expect(message.data.events[0].event).toEqual('token-pool');
        return true;
      })
      .close();

    context.resetConnectedPromise();

    await context.server
      .ws('/api/ws')
      .sendJson({
        type: 'start',
        namespace: 'ns1',
      })
      .exec(async () => {
        await context.connected;
        context.eventHandler({ events: [tokenPoolMessage] });
      })
      .expectJson(message => {
        expect(message.event).toEqual('started');
        expect(message.data.namespace).toEqual('ns1');
      })
      .expectJson(message => {
        expect(message.event).toEqual('batch');
        expect(message.data.events).toHaveLength(1);
        expect(message.data.events[0].event).toEqual('token-pool');
        return true;
      });
  });
};
