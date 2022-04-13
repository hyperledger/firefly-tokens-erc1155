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

import { Server } from 'http';
import { Observer } from 'rxjs';
import { AxiosResponse } from 'axios';
import { HttpService } from '@nestjs/axios';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'superwstest';
import {
  Event,
  EventStreamReply,
  EventStreamSubscription,
} from '../src/event-stream/event-stream.interfaces';
import { EventStreamService } from '../src/event-stream/event-stream.service';
import { EventStreamProxyGateway } from '../src/eventstream-proxy/eventstream-proxy.gateway';
import { ReceiptEvent } from '../src/eventstream-proxy/eventstream-proxy.interfaces';
import {
  ApprovalForAllEvent,
  EthConnectAsyncResponse,
  EthConnectReturn,
  TokenApproval,
  TokenApprovalEvent,
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
  TransferBatchEvent,
  TransferSingleEvent,
} from '../src/tokens/tokens.interfaces';
import { TokensService } from '../src/tokens/tokens.service';
import { WebSocketMessage } from '../src/websocket-events/websocket-events.base';
import { packSubscriptionName } from '../src/tokens/tokens.util';
import { AppModule } from './../src/app.module';

const BASE_URL = 'http://eth';
const INSTANCE_PATH = '/tokens';
const IDENTITY = '0x1';
const TOPIC = 'tokentest';
const PREFIX = 'fly';
const OPTIONS = {
  params: {
    'fly-from': IDENTITY,
    'fly-sync': 'false',
  },
};
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const tokenCreateEventSignature = 'TokenCreate(address,uint256,bytes)';
const transferSingleEventSignature = 'TransferSingle(address,address,address,uint256,uint256)';
const approvalForAllEventSignature = 'ApprovalForAll(address,address,bool)';
const transferBatchEventSignature = 'TransferBatch(address,address,address,uint256[],uint256[])';

class FakeObservable<T> {
  constructor(public data: T) {}

  subscribe(observer?: Partial<Observer<AxiosResponse<T>>>) {
    observer?.next &&
      observer?.next({
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
        data: this.data,
      });
    observer?.complete && observer?.complete();
  }
}

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<typeof request>;
  let http: {
    get: ReturnType<typeof jest.fn>;
    post: ReturnType<typeof jest.fn>;
  };
  let eventHandler: (events: Event[]) => void;
  let receiptHandler: (receipt: EventStreamReply) => void;

  const eventstream = {
    connect: (
      url: string,
      topic: string,
      handleEvents: (events: Event[]) => void,
      handleReceipt: (receipt: EventStreamReply) => void,
    ) => {
      eventHandler = handleEvents;
      receiptHandler = handleReceipt;
    },

    getSubscription: jest.fn(),
  };

  beforeEach(async () => {
    http = {
      get: jest.fn(),
      post: jest.fn(),
    };
    eventstream.getSubscription.mockReset();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(HttpService)
      .useValue(http)
      .overrideProvider(EventStreamService)
      .useValue(eventstream)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new WsAdapter(app));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    app.get(EventStreamProxyGateway).configure('url', TOPIC);
    app.get(TokensService).configure(BASE_URL, INSTANCE_PATH, TOPIC, PREFIX, '', '');

    (app.getHttpServer() as Server).listen();
    server = request(app.getHttpServer());
  });

  afterEach(async () => {
    await app.close();
  });

  it('Create fungible pool', async () => {
    const request: TokenPool = {
      type: TokenType.FUNGIBLE,
      requestId: 'op1',
      data: 'tx1',
      signer: IDENTITY,
    };
    const response: EthConnectAsyncResponse = {
      id: 'op1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/createpool').send(request).expect(202).expect({ id: 'op1' });

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      `${BASE_URL}${INSTANCE_PATH}/create`,
      {
        data: '0x747831',
        is_fungible: true,
      },
      {
        ...OPTIONS,
        params: {
          ...OPTIONS.params,
          'fly-id': 'op1',
        },
      },
    );
  });

  it('Create non-fungible pool', async () => {
    const request: TokenPool = {
      type: TokenType.NONFUNGIBLE,
      signer: '0xabc',
    };
    const response: EthConnectAsyncResponse = {
      id: '1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/createpool').send(request).expect(202).expect({ id: '1' });

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      `${BASE_URL}${INSTANCE_PATH}/create`,
      {
        data: '0x00',
        is_fungible: false,
      },
      {
        ...OPTIONS,
        params: {
          ...OPTIONS.params,
          'fly-from': '0xabc',
        },
      },
    );
  });

  it('Create pool - unrecognized fields', async () => {
    const request = {
      type: TokenType.FUNGIBLE,
      signer: IDENTITY,
      isBestPool: true, // will be stripped but will not cause an error
    };
    const response: EthConnectAsyncResponse = {
      id: 'op1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/createpool').send(request).expect(202).expect({ id: 'op1' });
  });

  it('Mint fungible token', async () => {
    const request: TokenMint = {
      poolLocator: 'F1',
      to: '1',
      amount: '2',
      data: 'test',
      signer: IDENTITY,
    };
    const response: EthConnectAsyncResponse = {
      id: '1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/mint').send(request).expect(202).expect({ id: '1' });

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      `${BASE_URL}${INSTANCE_PATH}/mintFungible`,
      {
        type_id: '340282366920938463463374607431768211456',
        to: ['1'],
        amounts: ['2'],
        data: '0x74657374',
      },
      OPTIONS,
    );
  });

  it('Mint non-fungible token', async () => {
    const request: TokenMint = {
      poolLocator: 'N1',
      to: '1',
      amount: '2',
      signer: IDENTITY,
    };
    const response: EthConnectAsyncResponse = {
      id: '1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/mint').send(request).expect(202).expect({ id: '1' });

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      `${BASE_URL}${INSTANCE_PATH}/mintNonFungible`,
      {
        type_id: '57896044618658097711785492504343953926975274699741220483192166611388333031424',
        to: ['1', '1'],
        data: '0x00',
      },
      OPTIONS,
    );
  });

  it('Burn token', async () => {
    const request: TokenBurn = {
      poolLocator: 'N1',
      tokenIndex: '1',
      from: 'A',
      amount: '1',
      data: 'tx1',
      signer: IDENTITY,
    };
    const response: EthConnectAsyncResponse = {
      id: '1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/burn').send(request).expect(202).expect({ id: '1' });

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      `${BASE_URL}${INSTANCE_PATH}/burn`,
      {
        id: '57896044618658097711785492504343953926975274699741220483192166611388333031425',
        from: 'A',
        amount: '1',
        data: '0x747831',
      },
      OPTIONS,
    );
  });

  it('Transfer token', async () => {
    const request: TokenTransfer = {
      poolLocator: 'F1',
      from: '1',
      to: '2',
      amount: '2',
      signer: IDENTITY,
    };
    const response: EthConnectAsyncResponse = {
      id: '1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/transfer').send(request).expect(202).expect({ id: '1' });

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      `${BASE_URL}${INSTANCE_PATH}/safeTransferFrom`,
      {
        id: '340282366920938463463374607431768211456',
        from: '1',
        to: '2',
        amount: '2',
        data: '0x00',
      },
      OPTIONS,
    );
  });

  it('Token approval', async () => {
    const request: TokenApproval = {
      poolLocator: 'F1',
      signer: IDENTITY,
      operator: '2',
      approved: true,
    };
    const response: EthConnectAsyncResponse = {
      id: '1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/approval').send(request).expect(202).expect({ id: '1' });

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      `${BASE_URL}${INSTANCE_PATH}/setApprovalForAllWithData`,
      {
        operator: '2',
        approved: true,
        data: '0x00',
      },
      OPTIONS,
    );
  });

  it('Query balance', async () => {
    const request: TokenBalanceQuery = {
      account: '1',
      poolLocator: 'F1',
      tokenIndex: '0',
    };
    const response: EthConnectReturn = {
      output: '1',
    };

    http.get = jest.fn(() => new FakeObservable(response));

    await server
      .get('/balance')
      .query(request)
      .expect(200)
      .expect(<TokenBalance>{
        balance: '1',
      });

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith(`${BASE_URL}${INSTANCE_PATH}/balanceOf`, {
      params: {
        account: '1',
        id: '340282366920938463463374607431768211456',
      },
    });
  });

  it('Websocket: token pool event', () => {
    eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName(TOPIC, '0x123', 'F1', ''),
    });

    return server
      .ws('/api/ws')
      .exec(() => {
        expect(eventHandler).toBeDefined();
        eventHandler([
          <TokenCreateEvent>{
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
        ]);
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        delete message.id;
        expect(message).toEqual(<WebSocketMessage>{
          event: 'token-pool',
          data: <TokenPoolEvent>{
            standard: 'ERC1155',
            poolLocator: 'F1',
            type: 'fungible',
            signer: 'bob',
            data: '',
            info: {
              address: '0x00001',
              typeId: '0x0000000000000000000000000000000100000000000000000000000000000000',
            },
            blockchain: {
              id: '000000000001/000000/000000',
              name: 'TokenCreate',
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

  it('Websocket: token pool event from base subscription', () => {
    eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName(TOPIC, '0x123', 'base', ''),
    });

    return server
      .ws('/api/ws')
      .exec(() => {
        expect(eventHandler).toBeDefined();
        eventHandler([
          <TokenCreateEvent>{
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
        ]);
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        delete message.id;
        expect(message).toEqual(<WebSocketMessage>{
          event: 'token-pool',
          data: <TokenPoolEvent>{
            standard: 'ERC1155',
            poolLocator: 'F1',
            type: 'fungible',
            signer: 'bob',
            data: '',
            info: {
              address: '0x00001',
              typeId: '0x0000000000000000000000000000000100000000000000000000000000000000',
            },
            blockchain: {
              id: '000000000001/000000/000000',
              name: 'TokenCreate',
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

  it('Websocket: token mint event', async () => {
    eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName(TOPIC, '0x123', 'F1', ''),
    });

    http.get = jest.fn(
      () =>
        new FakeObservable(<EthConnectReturn>{
          output: 'firefly://token/{id}',
        }),
    );

    await server
      .ws('/api/ws')
      .exec(() => {
        expect(eventHandler).toBeDefined();
        eventHandler([
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
        ]);
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        delete message.id;
        expect(message).toEqual(<WebSocketMessage>{
          event: 'token-mint',
          data: <TokenMintEvent>{
            subject: '000000000001/000000/000001',
            poolLocator: 'F1',
            to: 'A',
            amount: '5',
            signer: 'A',
            uri: 'firefly://token/0000000000000000000000000000000100000000000000000000000000000000',
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

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith(`${BASE_URL}${INSTANCE_PATH}/uri?input=0`, {});
  });

  it('Websocket: token burn event', async () => {
    eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName(TOPIC, '0x123', 'N1', ''),
    });

    http.get = jest.fn(
      () =>
        new FakeObservable(<EthConnectReturn>{
          output: 'firefly://token/{id}',
        }),
    );

    await server
      .ws('/api/ws')
      .exec(() => {
        expect(eventHandler).toBeDefined();
        eventHandler([
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
        ]);
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        delete message.id;
        expect(message).toEqual(<WebSocketMessage>{
          event: 'token-burn',
          data: <TokenBurnEvent>{
            subject: '000000000001/000000/000001',
            poolLocator: 'N1',
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

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith(`${BASE_URL}${INSTANCE_PATH}/uri?input=0`, {});
  });

  it('Websocket: token transfer event', async () => {
    eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName(TOPIC, '0x123', 'N1', ''),
    });

    http.get = jest.fn(
      () =>
        new FakeObservable(<EthConnectReturn>{
          output: 'firefly://token/{id}',
        }),
    );

    await server
      .ws('/api/ws')
      .exec(() => {
        expect(eventHandler).toBeDefined();
        eventHandler([
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
        ]);
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        delete message.id;
        expect(message).toEqual(<WebSocketMessage>{
          event: 'token-transfer',
          data: <TokenTransferEvent>{
            subject: '000000000001/000000/000001',
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

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith(`${BASE_URL}${INSTANCE_PATH}/uri?input=0`, {});
  });

  it('Websocket: token approval event', async () => {
    eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName(TOPIC, '0x123', 'N1', ''),
    });

    await server
      .ws('/api/ws')
      .exec(() => {
        expect(eventHandler).toBeDefined();
        eventHandler([
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
        ]);
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        delete message.id;
        expect(message).toEqual(<WebSocketMessage>{
          event: 'token-approval',
          data: <TokenApprovalEvent>{
            subject: 'A:B',
            signer: 'A',
            operator: 'B',
            poolLocator: 'N1',
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

  it('Websocket: token transfer event from wrong pool', () => {
    const sub = <EventStreamSubscription>{ name: packSubscriptionName(TOPIC, '0x123', 'N1', '') };
    eventstream.getSubscription.mockReturnValueOnce(sub).mockReturnValueOnce(sub);

    return server
      .ws('/api/ws')
      .exec(() => {
        expect(eventHandler).toBeDefined();
        eventHandler([
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
        ]);
      })
      .expectJson(message => {
        // Only the second transfer should have been processed
        expect(message.event).toEqual('token-transfer');
        expect(message.data.poolLocator).toEqual('N1');
        expect(message.data.blockchain.info.blockNumber).toEqual('2');
        return true;
      });
  });

  it('Websocket: token batch transfer', async () => {
    eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName(TOPIC, '0x123', 'N1', ''),
    });

    http.get = jest.fn(
      () =>
        new FakeObservable(<EthConnectReturn>{
          output: 'firefly://token/{id}',
        }),
    );

    await server
      .ws('/api/ws')
      .exec(() => {
        expect(eventHandler).toBeDefined();
        eventHandler([
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
        ]);
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        delete message.id;
        expect(message).toEqual(<WebSocketMessage>{
          event: 'token-transfer',
          data: <TokenTransferEvent>{
            subject: '000000000001/000000/000001/000000',
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
        return true;
      })
      .expectJson(message => {
        expect(message.id).toBeDefined();
        delete message.id;
        expect(message).toEqual(<WebSocketMessage>{
          event: 'token-transfer',
          data: <TokenTransferEvent>{
            subject: '000000000001/000000/000001/000001',
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

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith(`${BASE_URL}${INSTANCE_PATH}/uri?input=0`, {});
  });

  it('Websocket: success receipt', () => {
    return server
      .ws('/api/ws')
      .exec(() => {
        expect(receiptHandler).toBeDefined();
        receiptHandler(<EventStreamReply>{
          headers: {
            requestId: '1',
            type: 'TransactionSuccess',
          },
        });
      })
      .expectJson(message => {
        expect(message).toEqual(<WebSocketMessage>{
          event: 'receipt',
          data: <ReceiptEvent>{
            id: '1',
            success: true,
          },
        });
        return true;
      });
  });

  it('Websocket: error receipt', () => {
    return server
      .ws('/api/ws')
      .exec(() => {
        expect(receiptHandler).toBeDefined();
        receiptHandler(<EventStreamReply>{
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
          data: <ReceiptEvent>{
            id: '1',
            success: false,
            message: 'Failed',
          },
        });
        return true;
      });
  });

  it('Websocket: disconnect and reconnect', async () => {
    const tokenPoolMessage: TokenCreateEvent = {
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

    eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName(TOPIC, '0x123', 'F1', ''),
    });

    await server
      .ws('/api/ws')
      .exec(() => {
        expect(eventHandler).toBeDefined();
        eventHandler([tokenPoolMessage]);
      })
      .expectJson(message => {
        expect(message.event).toEqual('token-pool');
        return true;
      })
      .close();

    await server.ws('/api/ws').expectJson(message => {
      expect(message.event).toEqual('token-pool');
      return true;
    });
  });

  it('Websocket: client switchover', async () => {
    const tokenPoolMessage: TokenCreateEvent = {
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

    eventstream.getSubscription.mockReturnValueOnce(<EventStreamSubscription>{
      name: packSubscriptionName(TOPIC, '0x123', 'F1', ''),
    });

    const ws1 = server.ws('/api/ws');
    const ws2 = server.ws('/api/ws');

    await ws1
      .exec(() => {
        expect(eventHandler).toBeDefined();
        eventHandler([tokenPoolMessage]);
      })
      .expectJson(message => {
        expect(message.event).toEqual('token-pool');
        return true;
      })
      .close();

    await ws2.expectJson(message => {
      expect(message.event).toEqual('token-pool');
      return true;
    });
  });

  it('Websocket: batch + ack + client switchover', async () => {
    const tokenPoolMessage: TokenCreateEvent = {
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
    const tokenMintMessage: TransferSingleEvent = {
      subId: 'sb-123',
      signature: transferSingleEventSignature,
      address: '',
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
      },
    };

    const sub = <EventStreamSubscription>{ name: packSubscriptionName(TOPIC, '0x123', 'F1', '') };
    eventstream.getSubscription.mockReturnValueOnce(sub).mockReturnValueOnce(sub);

    const ws1 = server.ws('/api/ws');
    const ws2 = server.ws('/api/ws');
    let messageID1: string;

    await ws1
      .exec(() => {
        expect(eventHandler).toBeDefined();
        eventHandler([tokenPoolMessage, tokenMintMessage]);
      })
      .expectJson(message => {
        expect(message.event).toEqual('token-pool');
        messageID1 = message.id;
        return true;
      })
      .expectJson(message => {
        expect(message.event).toEqual('token-mint');
        return true;
      })
      .exec(client => {
        client.send(
          JSON.stringify({
            event: 'ack',
            data: { id: messageID1 },
          }),
        );
      })
      .close();

    await ws2.expectJson(message => {
      expect(message.event).toEqual('token-mint');
      return true;
    });
  });
});
