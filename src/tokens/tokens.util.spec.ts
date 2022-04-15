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

import {
  decodeHex,
  encodeHex,
  encodeHexIDForURI,
  packPoolLocator,
  packStreamName,
  packSubscriptionName,
  packTokenId,
  unpackPoolLocator,
  unpackSubscriptionName,
  unpackTokenId,
} from './tokens.util';

describe('Util', () => {
  it('encodeHex', () => {
    expect(encodeHex('hello')).toEqual('0x68656c6c6f');
    expect(encodeHex('')).toEqual('0x00');
  });

  it('encodeHexIDForURI', () => {
    expect(encodeHexIDForURI('314592')).toEqual(
      '000000000000000000000000000000000000000000000000000000000004cce0',
    );
  });

  it('decodeHex', () => {
    expect(decodeHex('0x68656c6c6f')).toEqual('hello');
    expect(decodeHex('')).toEqual('');
    expect(decodeHex('0x')).toEqual('');
    expect(decodeHex('0x0')).toEqual('');
    expect(decodeHex('0x00')).toEqual('');
  });

  it('packTokenId', () => {
    expect(packTokenId('F1', '0')).toEqual('340282366920938463463374607431768211456');
    expect(packTokenId('N1', '1')).toEqual(
      '57896044618658097711785492504343953926975274699741220483192166611388333031425',
    );
  });

  it('unpackTokenId', () => {
    expect(unpackTokenId('340282366920938463463374607431768211456')).toEqual({
      isFungible: true,
      poolId: 'F1',
    });
    expect(
      unpackTokenId(
        '57896044618658097711785492504343953926975274699741220483192166611388333031425',
      ),
    ).toEqual({
      isFungible: false,
      poolId: 'N1',
      tokenIndex: '1',
    });
  });

  it('packPoolLocator', () => {
    expect(packPoolLocator('N1', '5')).toEqual('id=N1&block=5');
  });

  it('unpackPoolLocator', () => {
    expect(unpackPoolLocator('id=N1&block=5')).toEqual({
      poolId: 'N1',
      blockNumber: '5',
    });
    expect(unpackPoolLocator('N1')).toEqual({
      poolId: 'N1',
    });
  });

  it('packStreamName', () => {
    expect(packStreamName('token', '0x123')).toEqual('token:0x123');
  });

  it('packSubscriptionName', () => {
    expect(packSubscriptionName('token', '0x123', 'F1', 'create')).toEqual('token:0x123:F1:create');
    expect(packSubscriptionName('tok:en', '0x123', 'N1', 'create')).toEqual(
      'tok:en:0x123:N1:create',
    );
  });

  it('unpackSubscriptionName', () => {
    expect(unpackSubscriptionName('token', 'token:0x123:F1:create')).toEqual({
      prefix: 'token',
      instancePath: '0x123',
      poolLocator: 'F1',
      event: 'create',
    });
    expect(unpackSubscriptionName('tok:en', 'tok:en:0x123:N1:create')).toEqual({
      prefix: 'tok:en',
      instancePath: '0x123',
      poolLocator: 'N1',
      event: 'create',
    });
    expect(unpackSubscriptionName('token', 'bad:N1:create')).toEqual({});
  });
});
