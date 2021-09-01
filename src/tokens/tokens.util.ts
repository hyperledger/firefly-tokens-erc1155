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

export function encodeHex(data: string) {
  return '0x' + Buffer.from(data, 'utf8').toString('hex');
}

export function decodeHex(data: string) {
  return Buffer.from(data.replace('0x', ''), 'hex').toString('utf8');
}

export function isFungible(poolId: string) {
  return poolId[0] === 'F';
}

export function packTokenId(poolId: string, tokenIndex = '0') {
  return (
    (BigInt(isFungible(poolId) ? 0 : 1) << BigInt(255)) |
    (BigInt(poolId.substr(1)) << BigInt(128)) |
    BigInt(tokenIndex)
  ).toString();
}

export function unpackTokenId(id: string) {
  const val = BigInt(id);
  const isFungible = val >> BigInt(255) === BigInt(0);
  return {
    isFungible: isFungible,
    poolId: (isFungible ? 'F' : 'N') + (BigInt.asUintN(255, val) >> BigInt(128)),
    tokenIndex: BigInt.asUintN(128, val).toString(),
  };
}
