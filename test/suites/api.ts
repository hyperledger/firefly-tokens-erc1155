import {
  TokenPool,
  TokenType,
  EthConnectAsyncResponse,
  TokenMint,
  TokenBurn,
  TokenTransfer,
  TokenApproval,
  EthConnectReturn,
  TokenBalance,
  TokenBalanceQuery,
  CheckInterfaceRequest,
  InterfaceFormat,
  CheckInterfaceResponse,
} from '../../src/tokens/tokens.interfaces';
import { TestContext, FakeObservable, BASE_URL, CONTRACT_ADDRESS } from '../app.e2e-context';
import { abi as ERC1155MixedFungibleAbi } from '../../src/abi/ERC1155MixedFungible.json';

const queryHeader = 'Query';
const sendTransactionHeader = 'SendTransaction';
const requestId = 'default:6f2f0aaf-be21-4977-b34a-8853b602d69d';

const IDENTITY = '0x1';

export default (context: TestContext) => {
  it('Create fungible pool', async () => {
    const request: TokenPool = {
      type: TokenType.FUNGIBLE,
      requestId,
      data: 'tx1',
      signer: IDENTITY,
    };
    const response: EthConnectAsyncResponse = {
      id: requestId,
      sent: true,
    };

    context.http.post = jest.fn(() => new FakeObservable(response));

    await context.server.post('/createpool').send(request).expect(202).expect({ id: requestId });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
      `${BASE_URL}`,
      {
        headers: {
          id: requestId,
          type: sendTransactionHeader,
        },
        from: IDENTITY,
        to: CONTRACT_ADDRESS,
        method: ERC1155MixedFungibleAbi.find(m => m.name === 'create'),
        params: [true, '0x747831'],
      },
      {},
    );
  });

  it('Create non-fungible pool', async () => {
    const request: TokenPool = {
      type: TokenType.NONFUNGIBLE,
      signer: IDENTITY,
      requestId,
    };
    const response: EthConnectAsyncResponse = {
      id: requestId,
      sent: true,
    };

    context.http.post = jest.fn(() => new FakeObservable(response));

    await context.server.post('/createpool').send(request).expect(202).expect({ id: requestId });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
      `${BASE_URL}`,
      {
        headers: {
          id: requestId,
          type: sendTransactionHeader,
        },
        from: IDENTITY,
        to: CONTRACT_ADDRESS,
        method: ERC1155MixedFungibleAbi.find(m => m.name === 'create'),
        params: [false, '0x00'],
      },
      {},
    );
  });

  it('Create non-fungible pool - non-default address', async () => {
    const request: TokenPool = {
      type: TokenType.NONFUNGIBLE,
      signer: IDENTITY,
      requestId,
      config: {
        address: '0x12345678',
        blockNumber: '42000',
      },
    };
    const response: EthConnectAsyncResponse = {
      id: requestId,
      sent: true,
    };

    context.http.post = jest.fn(() => new FakeObservable(response));

    await context.server.post('/createpool').send(request).expect(202).expect({ id: requestId });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
      `${BASE_URL}`,
      {
        headers: {
          id: requestId,
          type: sendTransactionHeader,
        },
        from: IDENTITY,
        to: '0x12345678',
        method: ERC1155MixedFungibleAbi.find(m => m.name === 'create'),
        params: [false, '0x00'],
      },
      {},
    );

    expect(context.eventstream.getOrCreateSubscription).toHaveBeenCalledWith(
      `${BASE_URL}`,
      ERC1155MixedFungibleAbi.find(m => m.name === 'TokenPoolCreation'),
      undefined,
      'fft:0x12345678:base:TokenPoolCreation',
      '0x12345678',
      [ERC1155MixedFungibleAbi.find(m => m.name === 'create')],
      '42000',
    );
  });

  it('Create pool - unrecognized fields', async () => {
    const request = {
      type: TokenType.FUNGIBLE,
      signer: IDENTITY,
      isBestPool: true, // will be stripped but will not cause an error
      requestId,
    };
    const response: EthConnectAsyncResponse = {
      id: requestId,
      sent: true,
    };

    context.http.post = jest.fn(() => new FakeObservable(response));

    await context.server.post('/createpool').send(request).expect(202).expect({ id: requestId });
  });

  it('Mint fungible token', async () => {
    const request: TokenMint = {
      poolLocator: 'F1',
      to: '1',
      amount: '2',
      data: 'test',
      signer: IDENTITY,
      requestId,
    };
    const response: EthConnectAsyncResponse = {
      id: requestId,
      sent: true,
    };

    context.http.post = jest.fn(() => new FakeObservable(response));

    await context.server.post('/mint').send(request).expect(202).expect({ id: requestId });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
      `${BASE_URL}`,
      {
        headers: {
          id: requestId,
          type: sendTransactionHeader,
        },
        from: IDENTITY,
        to: CONTRACT_ADDRESS,
        method: ERC1155MixedFungibleAbi.find(m => m.name === 'mintFungible'),
        params: ['340282366920938463463374607431768211456', ['1'], ['2'], '0x74657374'],
      },
      {},
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
      `${BASE_URL}`,
      {
        headers: {
          type: sendTransactionHeader,
        },
        from: IDENTITY,
        to: CONTRACT_ADDRESS,
        method: ERC1155MixedFungibleAbi.find(m => m.name === 'mintNonFungible'),
        params: [
          '57896044618658097711785492504343953926975274699741220483192166611388333031424',
          ['1', '1'],
          '0x00',
        ],
      },
      {},
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
      `${BASE_URL}`,
      {
        headers: {
          type: sendTransactionHeader,
        },
        from: IDENTITY,
        to: CONTRACT_ADDRESS,
        method: ERC1155MixedFungibleAbi.find(m => m.name === 'burn'),
        params: [
          'A',
          '57896044618658097711785492504343953926975274699741220483192166611388333031425',
          '1',
          '0x747831',
        ],
      },
      {},
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
      `${BASE_URL}`,
      {
        headers: {
          type: sendTransactionHeader,
        },
        from: IDENTITY,
        to: CONTRACT_ADDRESS,
        method: ERC1155MixedFungibleAbi.find(m => m.name === 'safeTransferFrom'),
        params: ['1', '2', '340282366920938463463374607431768211456', '2', '0x00'],
      },
      {},
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
      `${BASE_URL}`,
      {
        headers: {
          type: sendTransactionHeader,
        },
        from: IDENTITY,
        to: CONTRACT_ADDRESS,
        method: ERC1155MixedFungibleAbi.find(m => m.name === 'setApprovalForAllWithData'),
        params: ['2', true, '0x00'],
      },
      {},
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

    context.http.post = jest.fn(() => new FakeObservable(response));

    await context.server
      .get('/balance')
      .query(request)
      .expect(200)
      .expect(<TokenBalance>{
        balance: '1',
      });

    expect(context.http.post).toHaveBeenCalledTimes(1);
    expect(context.http.post).toHaveBeenCalledWith(
      `${BASE_URL}`,
      {
        headers: {
          type: queryHeader,
        },
        to: CONTRACT_ADDRESS,
        method: ERC1155MixedFungibleAbi.find(m => m.name === 'balanceOf'),
        params: ['1', '340282366920938463463374607431768211456'],
      },
      {},
    );
  });

  it('Check interface', async () => {
    const request: CheckInterfaceRequest = {
      poolLocator: 'F1',
      format: InterfaceFormat.ABI,
      abi: ERC1155MixedFungibleAbi,
    };

    const response: CheckInterfaceResponse = {
      approval: {
        format: InterfaceFormat.ABI,
        abi: [
          ...ERC1155MixedFungibleAbi.filter(m => m.name === 'setApprovalForAllWithData'),
          ...ERC1155MixedFungibleAbi.filter(m => m.name === 'setApprovalForAll'),
        ],
      },
      burn: {
        format: InterfaceFormat.ABI,
        abi: ERC1155MixedFungibleAbi.filter(m => m.name === 'burn'),
      },
      mint: {
        format: InterfaceFormat.ABI,
        abi: [
          ...ERC1155MixedFungibleAbi.filter(m => m.name === 'mintFungible'),
          ...ERC1155MixedFungibleAbi.filter(m => m.name === 'mintNonFungibleWithURI'),
          ...ERC1155MixedFungibleAbi.filter(m => m.name === 'mintNonFungible'),
        ],
      },
      transfer: {
        format: InterfaceFormat.ABI,
        abi: ERC1155MixedFungibleAbi.filter(m => m.name === 'safeTransferFrom'),
      },
    };

    await context.server.post('/checkinterface').send(request).expect(200).expect(response);
  });
};
