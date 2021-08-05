import { HttpService } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStreamService } from './event-stream.service';

describe('EventStreamService', () => {
  let service: EventStreamService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventStreamService,
        {
          provide: HttpService,
          useValue: jest.fn(),
        },
      ],
    }).compile();

    service = module.get<EventStreamService>(EventStreamService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
