import {
  TokenPool,
  TokenType,
  EthConnectAsyncResponse,
  TokenMint,
  TokenBurn,
  TokenTransfer,
  TokenApproval,
  TokenBalanceQuery,
  EthConnectReturn,
  TokenBalance,
} from '../../src/tokens/tokens.interfaces';
import { TestContext, FakeObservable, BASE_URL, INSTANCE_PATH } from '../app.e2e-context';

const IDENTITY = '0x1';
const OPTIONS = {
  params: {
    'fly-from': IDENTITY,
    'fly-sync': 'false',
  },
};

export default (context: TestContext) => {
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

    context.http.post = jest.fn(() => new FakeObservable(response));

    await context.server.post('/createpool').send(request).expect(202).expect({ id: 'op1' });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
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

    context.http.post = jest.fn(() => new FakeObservable(response));

    await context.server.post('/createpool').send(request).expect(202).expect({ id: '1' });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
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

    context.http.post = jest.fn(() => new FakeObservable(response));

    await context.server.post('/createpool').send(request).expect(202).expect({ id: 'op1' });
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

    context.http.post = jest.fn(() => new FakeObservable(response));

    await context.server.post('/mint').send(request).expect(202).expect({ id: '1' });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
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

    context.http.post = jest.fn(() => new FakeObservable(response));

    await context.server.post('/mint').send(request).expect(202).expect({ id: '1' });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
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

    context.http.post = jest.fn(() => new FakeObservable(response));

    await context.server.post('/burn').send(request).expect(202).expect({ id: '1' });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
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

    context.http.post = jest.fn(() => new FakeObservable(response));

    await context.server.post('/transfer').send(request).expect(202).expect({ id: '1' });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
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

    context.http.post = jest.fn(() => new FakeObservable(response));

    await context.server.post('/approval').send(request).expect(202).expect({ id: '1' });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
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

    context.http.get = jest.fn(() => new FakeObservable(response));

    await context.server
      .get('/balance')
      .query(request)
      .expect(200)
      .expect(<TokenBalance>{
        balance: '1',
      });

    expect(context.http.get).toHaveBeenCalledTimes(1);
    expect(context.http.get).toHaveBeenCalledWith(`${BASE_URL}${INSTANCE_PATH}/balanceOf`, {
      params: {
        account: '1',
        id: '340282366920938463463374607431768211456',
      },
    });
  });
};
