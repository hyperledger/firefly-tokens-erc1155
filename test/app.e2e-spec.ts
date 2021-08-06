import { Test, TestingModule } from '@nestjs/testing';
import { HttpService, INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { WsAdapter } from '@nestjs/platform-ws';
import { TokensService } from '../src/tokens/tokens.service';
import { EthConnectAsyncResponse, TokenPool, TokenType } from '../src/tokens/tokens.interfaces';
import { AppModule } from './../src/app.module';

const INSTANCE_URL = 'http://tokens';
const IDENTITY = '0x1';
const OPTIONS = {
  params: {
    'fly-from': IDENTITY,
    'fly-sync': 'false',
  },
};

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
    post: ReturnType<typeof jest.fn>;
  };

  beforeEach(async () => {
    http = {
      post: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(HttpService)
      .useValue(http)
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

    app.get(TokensService).configure(INSTANCE_URL, IDENTITY);

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
      client_id: '1',
    };
    const response: EthConnectAsyncResponse = {
      id: '1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/pool').send(request).expect(202).expect(response);

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      `${INSTANCE_URL}/create`,
      {
        uri: 'fly://erc1155/testns/token1/1',
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
      client_id: '1',
    };
    const response: EthConnectAsyncResponse = {
      id: '1',
      sent: true,
    };

    http.post = jest.fn(() => new FakeObservable(response));

    await server.post('/pool').send(request).expect(202).expect(response);

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      `${INSTANCE_URL}/create`,
      {
        uri: 'fly://erc1155/testns/token1/1',
        is_fungible: false,
      },
      OPTIONS,
    );
  });
});
