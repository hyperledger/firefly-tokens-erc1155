import { Test, TestingModule } from '@nestjs/testing';
import * as sinon from 'sinon';
import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';

describe('TokensController', () => {
  let controller: TokensController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TokensController],
      providers: [
        {
          provide: TokensService,
          useValue: sinon.fake(),
        },
      ],
    }).compile();

    controller = module.get<TokensController>(TokensController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
