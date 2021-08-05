import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventStreamService } from '../event-stream/event-stream.service';
import { EventStreamProxyGateway } from './eventstream-proxy.gateway';

describe('EventStreamProxyGateway', () => {
  let gateway: EventStreamProxyGateway;
  const config = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventStreamProxyGateway,
        {
          provide: ConfigService,
          useValue: config,
        },
        {
          provide: EventStreamService,
          useValue: jest.fn(),
        },
      ],
    }).compile();

    gateway = module.get<EventStreamProxyGateway>(EventStreamProxyGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
