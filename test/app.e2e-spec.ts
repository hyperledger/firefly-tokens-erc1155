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
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'superwstest';
import { WsAdapter } from '@nestjs/platform-ws';
import { TokensService } from '../src/tokens/tokens.service';
import {
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
} from '../src/tokens/tokens.interfaces';
import { EventStreamService } from '../src/event-stream/event-stream.service';
import { Event, EventStreamReply } from '../src/event-stream/event-stream.interfaces';
import { EventStreamProxyGateway } from '../src/eventstream-proxy/eventstream-proxy.gateway';
import { WebSocketMessage } from '../src/websocket-events/websocket-events.base';
import { ReceiptEvent } from '../src/eventstream-proxy/eventstream-proxy.interfaces';
import { AppModule } from './../src/app.module';

const BASE_URL = 'http://eth';
const INSTANCE_URL = `${BASE_URL}/tokens`;
const IDENTITY = '0x1';
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

class FakeObservable<T> {
  constructor(public data: T) {}

  toPromise() {
    return this;
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
    subscribe: (
      url: string,
      topic: string,
      handleEvents: (events: Event[]) => void,
      handleReceipt: (receipt: EventStreamReply) => void,
    ) => {
      eventHandler = handleEvents;
      receiptHandler = handleReceipt;
    },
  };

  beforeEach(async () => {
    http = {
      get: jest.fn(),
      post: jest.fn(),
    };

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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    app.get(EventStreamProxyGateway).configure('url', 'topic');
    app.get(TokensService).configure(BASE_URL, INSTANCE_URL, IDENTITY, PREFIX);

    (app.getHttpServer() as Server).listen();
    server = request(app.getHttpServer());
  });

  afterEach(async () => {
    await app.close();
  });

  it('Create fungible pool', async () => {
    const request: TokenPool = {
      type: TokenType.FUNGIBLE,
      namespace: 'testns',
      name: 'token1',
      clientId: '1',
    };
    const response: EthConnectAsyncResponse = {
      id: '1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/pool').send(request).expect(202).expect({ id: '1' });

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      `${INSTANCE_URL}/create`,
      {
        data: '0x746573746e7300746f6b656e310031',
        is_fungible: true,
      },
      OPTIONS,
    );
  });

  it('Create non-fungible pool', async () => {
    const request: TokenPool = {
      type: TokenType.NONFUNGIBLE,
      namespace: 'testns',
      name: 'token1',
      clientId: '1',
    };
    const response: EthConnectAsyncResponse = {
      id: '1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/pool').send(request).expect(202).expect({ id: '1' });

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      `${INSTANCE_URL}/create`,
      {
        data: '0x746573746e7300746f6b656e310031',
        is_fungible: false,
      },
      OPTIONS,
    );
  });

  it('Mint fungible token', async () => {
    const request: TokenMint = {
      poolId: 'F1',
      to: '1',
      amount: 2,
    };
    const response: EthConnectAsyncResponse = {
      id: '1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/mint').send(request).expect(202).expect({ id: '1' });

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      `${INSTANCE_URL}/mintFungible`,
      {
        type_id: '340282366920938463463374607431768211456',
        to: ['1'],
        amounts: [2],
        data: [0],
      },
      OPTIONS,
    );
  });

  it('Mint non-fungible token', async () => {
    const request: TokenMint = {
      poolId: 'N1',
      to: '1',
      amount: 2,
    };
    const response: EthConnectAsyncResponse = {
      id: '1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/mint').send(request).expect(202).expect({ id: '1' });

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      `${INSTANCE_URL}/mintNonFungible`,
      {
        type_id: '57896044618658097711785492504343953926975274699741220483192166611388333031424',
        to: ['1', '1'],
        data: [0],
      },
      OPTIONS,
    );
  });

  it('Query balance', async () => {
    const request: TokenBalanceQuery = {
      account: '1',
      poolId: 'F1',
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
        balance: 1,
      });

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith(`${INSTANCE_URL}/balanceOf`, {
      params: {
        account: '1',
        id: '340282366920938463463374607431768211456',
      },
    });
  });

  it('Transfer token', async () => {
    const request: TokenTransfer = {
      poolId: 'F1',
      tokenIndex: '0',
      from: '1',
      to: '2',
      amount: 2,
    };
    const response: EthConnectAsyncResponse = {
      id: '1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/transfer').send(request).expect(202).expect({ id: '1' });

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      `${INSTANCE_URL}/safeTransferFrom`,
      {
        id: '340282366920938463463374607431768211456',
        from: '1',
        to: '2',
        amount: 2,
        data: [0],
      },
      OPTIONS,
    );
  });

  it('Websocket: token pool event', () => {
    return server
      .ws('/api/ws')
      .exec(() => {
        expect(eventHandler).toBeDefined();
        eventHandler([
          <TokenCreateEvent>{
            signature: tokenCreateEventSignature,
            address: 'bob',
            blockNumber: '1',
            transactionIndex: '0x0',
            transactionHash: '0x123',
            data: {
              operator: 'bob',
              type_id: '340282366920938463463374607431768211456',
              data: '0x6e73006e616d65006964',
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
            namespace: 'ns',
            name: 'name',
            clientId: 'id',
            poolId: 'F1',
            type: 'fungible',
            operator: 'bob',
            transaction: {
              blockNumber: '1',
              transactionIndex: '0x0',
              transactionHash: '0x123',
            },
          },
        });
        return true;
      });
  });

  it('Websocket: token mint event', () => {
    return server
      .ws('/api/ws')
      .exec(() => {
        expect(eventHandler).toBeDefined();
        eventHandler([
          <TransferSingleEvent>{
            signature: transferSingleEventSignature,
            address: '',
            blockNumber: '1',
            transactionIndex: '0x0',
            transactionHash: '0x123',
            data: {
              id: '340282366920938463463374607431768211456',
              from: ZERO_ADDRESS,
              to: 'A',
              operator: 'A',
              value: 5,
              transaction: {
                blockNumber: '1',
                transactionIndex: '0x0',
                transactionHash: '0x123',
              },
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
            poolId: 'F1',
            tokenIndex: '0',
            to: 'A',
            amount: 5,
            operator: 'A',
            transaction: {
              blockNumber: '1',
              transactionIndex: '0x0',
              transactionHash: '0x123',
            },
          },
        });
        return true;
      });
  });

  it('Websocket: token transfer event', () => {
    return server
      .ws('/api/ws')
      .exec(() => {
        expect(eventHandler).toBeDefined();
        eventHandler([
          <TransferSingleEvent>{
            signature: transferSingleEventSignature,
            address: '',
            blockNumber: '1',
            transactionIndex: '0x0',
            transactionHash: '0x123',
            data: {
              id: '57896044618658097711785492504343953926975274699741220483192166611388333031425',
              from: 'A',
              to: 'B',
              operator: 'A',
              value: 1,
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
            poolId: 'N1',
            tokenIndex: '1',
            from: 'A',
            to: 'B',
            amount: 1,
            operator: 'A',
            transaction: {
              blockNumber: '1',
              transactionIndex: '0x0',
              transactionHash: '0x123',
            },
          },
        });
        return true;
      });
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
      signature: tokenCreateEventSignature,
      address: 'bob',
      blockNumber: '1',
      transactionIndex: '0x0',
      transactionHash: '0x123',
      data: {
        operator: 'bob',
        type_id: '340282366920938463463374607431768211456',
        data: '0x6e73006e616d65006964',
      },
    };

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
      signature: tokenCreateEventSignature,
      address: 'bob',
      blockNumber: '1',
      transactionIndex: '0x0',
      transactionHash: '0x123',
      data: {
        operator: 'bob',
        type_id: '340282366920938463463374607431768211456',
        data: '0x6e73006e616d65006964',
      },
    };

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
      signature: tokenCreateEventSignature,
      address: 'bob',
      blockNumber: '1',
      transactionIndex: '0x0',
      transactionHash: '0x123',
      data: {
        operator: 'bob',
        type_id: '340282366920938463463374607431768211456',
        data: '0x6e73006e616d65006964',
      },
    };
    const tokenMintMessage: TransferSingleEvent = {
      signature: transferSingleEventSignature,
      address: '',
      blockNumber: '1',
      transactionIndex: '0x0',
      transactionHash: '0x123',
      data: {
        id: '340282366920938463463374607431768211456',
        from: ZERO_ADDRESS,
        to: 'A',
        operator: 'A',
        value: 5,
      },
    };

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
