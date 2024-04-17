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

import { PoolLocator } from './tokens.interfaces';
import {
  decodeHex,
  encodeHex,
  encodeHexIDForURI,
  packPoolLocator,
  packStreamName,
  packSubscriptionName,
  computeTokenId,
  unpackPoolLocator,
  unpackSubscriptionName,
  unpackTypeId,
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
    const pool: PoolLocator = {
      isFungible: true,
      startId: '0x100000000000000000000000000000000',
      endId: '0x1ffffffffffffffffffffffffffffffff',
    };
    expect(computeTokenId(pool, '1')).toEqual('340282366920938463463374607431768211457');
  });

  it('unpackTokenId', () => {
    expect(unpackTypeId('340282366920938463463374607431768211456')).toEqual({
      isFungible: true,
      startId: '0x100000000000000000000000000000000',
      endId: '0x100000000000000000000000000000000',
    });
    expect(
      unpackTypeId('57896044618658097711785492504343953926975274699741220483192166611388333031425'),
    ).toEqual({
      isFungible: false,
      startId: '0x8000000000000000000000000000000100000000000000000000000000000000',
      endId: '0x80000000000000000000000000000001ffffffffffffffffffffffffffffffff',
      tokenIndex: '1',
    });
  });

  it('packPoolLocator', () => {
    expect(packPoolLocator('0x123', false, '1', '5', '1000')).toEqual(
      'address=0x123&type=nonfungible&startId=1&endId=5&block=1000',
    );
  });

  it('unpackPoolLocator', () => {
    expect(
      unpackPoolLocator('address=0x123&type=nonfungible&startId=1&endId=5&block=1000'),
    ).toEqual({
      address: '0x123',
      isFungible: false,
      startId: '1',
      endId: '5',
      blockNumber: '1000',
    });
    expect(unpackPoolLocator('id=N1&block=5')).toEqual({
      isFungible: false,
      startId: '0x8000000000000000000000000000000100000000000000000000000000000000',
      endId: '0x80000000000000000000000000000001ffffffffffffffffffffffffffffffff',
      blockNumber: '5',
    });
    expect(unpackPoolLocator('N1')).toEqual({
      isFungible: false,
      startId: '0x8000000000000000000000000000000100000000000000000000000000000000',
      endId: '0x80000000000000000000000000000001ffffffffffffffffffffffffffffffff',
    });
  });

  it('packStreamName', () => {
    expect(packStreamName('token', '0x123')).toEqual('token:0x123');
  });

  it('packSubscriptionName', () => {
    expect(packSubscriptionName('0x123', 'F1', 'create', 'ns1')).toEqual('fft:0x123:F1:create:ns1');
    expect(packSubscriptionName('0x123', 'F1', 'create', 'ns1:test')).toEqual(
      'fft:0x123:F1:create:ns1%3Atest',
    );
  });

  it('unpackSubscriptionName', () => {
    expect(unpackSubscriptionName('fft:0x123:F1:create:ns1')).toEqual({
      address: '0x123',
      poolLocator: 'F1',
      event: 'create',
      poolData: 'ns1',
    });
    expect(unpackSubscriptionName('token:0x123:F1:create')).toEqual({
      address: '0x123',
      poolLocator: 'F1',
      event: 'create',
      poolData: undefined,
    });
    expect(unpackSubscriptionName('fft:0x123:F1:create:ns1%3Atest')).toEqual({
      address: '0x123',
      poolLocator: 'F1',
      event: 'create',
      poolData: 'ns1:test',
    });
  });
});
