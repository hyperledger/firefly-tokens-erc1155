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
import { Test, TestingModule } from '@nestjs/testing';
import { EventStreamService } from '../event-stream/event-stream.service';
import { EventStreamProxyGateway } from '../eventstream-proxy/eventstream-proxy.gateway';
import { AbiMapperService } from './abimapper.service';
import { BlockchainConnectorService } from './blockchain.service';
import { TokensService } from './tokens.service';
import { newContext } from '../request-context/request-context.decorator';

describe('TokensService', () => {
  let service: TokensService;
  let eventStream: {
    addListener: ReturnType<typeof jest.fn>;
    getStreams: ReturnType<typeof jest.fn>;
    getSubscriptions: ReturnType<typeof jest.fn>;
  };

  beforeEach(async () => {
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
    }).compile();

    service = module.get<TokensService>(TokensService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Subscription migration', () => {
    it('should not migrate if no subscriptions exists', async () => {
      service.topic = 'tokens';
      service.instancePath = '0x123';
      eventStream.getStreams.mockReturnValueOnce([{ name: 'tokens:0x123' }]);
      eventStream.getSubscriptions.mockReturnValueOnce([]);
      expect(await service.migrationCheck(newContext())).toBe(false);
    });

    it('should not migrate if correct base subscription exists', async () => {
      service.topic = 'tokens';
      service.instancePath = '0x123';
      eventStream.getStreams.mockReturnValueOnce([{ name: 'tokens:0x123' }]);
      eventStream.getSubscriptions.mockReturnValueOnce([
        { name: 'fft:0x123:base:TokenPoolCreation' },
      ]);
      expect(await service.migrationCheck(newContext())).toBe(false);
    });

    it('should migrate if any event subscriptions are missing', async () => {
      service.topic = 'tokens';
      service.instancePath = '0x123';
      eventStream.getStreams.mockReturnValueOnce([{ name: 'tokens:0x123' }]);
      eventStream.getSubscriptions.mockReturnValueOnce([
        { name: 'fft:0x123:p1:TokenPoolCreation' },
      ]);
      expect(await service.migrationCheck(newContext())).toBe(true);
    });

    it('should not migrate if all event subscriptions exist', async () => {
      service.topic = 'tokens';
      service.instancePath = '0x123';
      eventStream.getStreams.mockReturnValueOnce([{ name: 'tokens:0x123' }]);
      eventStream.getSubscriptions.mockReturnValueOnce([
        { name: 'fft:0x123:p1:TokenPoolCreation:ns1' },
        { name: 'fft:0x123:p1:TransferSingle:ns1' },
        { name: 'fft:0x123:p1:TransferBatch:ns1' },
        { name: 'fft:0x123:p1:ApprovalForAll:ns1' },
      ]);
      expect(await service.migrationCheck(newContext())).toBe(false);
    });
  });
});
