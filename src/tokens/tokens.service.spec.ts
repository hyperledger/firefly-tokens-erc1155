// Copyright © 2023 Kaleido, Inc.
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
import { Test, TestingModule } from '@nestjs/testing';
import { AxiosResponse } from '@nestjs/terminus/dist/health-indicator/http/axios.interfaces';
import { Observer } from 'rxjs';
import { EventStreamService } from '../event-stream/event-stream.service';
import { EventStreamProxyGateway } from '../eventstream-proxy/eventstream-proxy.gateway';
import { newContext } from '../request-context/request-context.decorator';
import { AbiMapperService } from './abimapper.service';
import { BlockchainConnectorService, RetryConfiguration } from './blockchain.service';
import { TokensService } from './tokens.service';
import { EthConnectReturn } from './tokens.interfaces';

const BASE_URL = 'http://eth';

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

describe('TokensService', () => {
  let http: {
    post: ReturnType<typeof jest.fn>;
  };
  let service: TokensService;
  let eventStream: {
    addListener: ReturnType<typeof jest.fn>;
    getStreams: ReturnType<typeof jest.fn>;
    getSubscriptions: ReturnType<typeof jest.fn>;
  };
  let blockchain: BlockchainConnectorService;

  const mockECONNErrors = (count: number) => {
    for (let i = 0; i < count; i++) {
      http.post.mockImplementationOnce(() => {
        throw new Error('connect ECONNREFUSED 10.1.2.3');
      });
    }
  };

  beforeEach(async () => {
    http = {
      post: jest.fn(),
    };
    eventStream = {
      addListener: jest.fn(),
      getStreams: jest.fn(),
      getSubscriptions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokensService,
        BlockchainConnectorService,
        AbiMapperService,
        {
          provide: HttpService,
          useValue: jest.fn(),
        },
        {
          provide: EventStreamService,
          useValue: eventStream,
        },
        {
          provide: EventStreamProxyGateway,
          useValue: { addListener: jest.fn() },
        },
      ],
    })
      .overrideProvider(HttpService)
      .useValue(http)
      .compile();

    const blockchainRetryCfg: RetryConfiguration = {
      retryBackOffFactor: 2,
      retryBackOffLimit: 500,
      retryBackOffInitial: 50,
      retryCondition: '.*ECONN.*',
      retriesMax: 15,
    };

    service = module.get<TokensService>(TokensService);
    blockchain = module.get(BlockchainConnectorService);
    blockchain.configure(BASE_URL, '', '', [], blockchainRetryCfg);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Query token URI', () => {
    it('should get the token URI', async () => {
      const ctx = newContext();

      http.post.mockReturnValueOnce(
        new FakeObservable(<EthConnectReturn>{
          output: 'ff://my/nft/uri',
        }),
      );

      const val = await blockchain.query(ctx, '', undefined, undefined);

      expect(val.output).toBe('ff://my/nft/uri');
      expect(http.post).toHaveBeenCalledTimes(1); // Expect call to work first time
    });

    it('should get the token URI after 6 ECONNREFUSED retries', async () => {
      const ctx = newContext();

      mockECONNErrors(6);
      http.post.mockReturnValueOnce(
        new FakeObservable(<EthConnectReturn>{
          output: 'ff://my/nft/uri',
        }),
      );

      const val = await blockchain.query(ctx, '', undefined, undefined);

      expect(val.output).toBe('ff://my/nft/uri');
      expect(http.post).toHaveBeenCalledTimes(7); // Expect 6 ECONN errors, then final call OK = 7 POSTs
    });
  });
});
