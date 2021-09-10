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
  packTokenId,
  unpackTokenId,
} from './tokens.util';

describe('Util', () => {
  it('encodeHex', () => {
    expect(encodeHex('hello')).toEqual('0x68656c6c6f');
    expect(encodeHex('')).toEqual('0x');
  });

  it('decodeHex', () => {
    expect(decodeHex('0x68656c6c6f')).toEqual('hello');
    expect(decodeHex('')).toEqual('');
    expect(decodeHex('0x')).toEqual('');
    expect(decodeHex('0x0')).toEqual('');
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
      tokenIndex: '0',
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
});
