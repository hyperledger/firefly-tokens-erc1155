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

const SUBSCRIPTION_PREFIX = 'fft';

/**
 * Encode a UTF-8 string into hex bytes with a leading 0x
 */
export function encodeHex(data: string) {
  const encoded = Buffer.from(data, 'utf8').toString('hex');
  // Ethconnect does not handle empty byte arguments well, so we encode a single null byte
  // when there is no data.
  // See https://github.com/hyperledger/firefly-ethconnect/issues/133
  return encoded === '' ? '0x00' : '0x' + encoded;
}

/**
 * Decode a series of hex bytes into a UTF-8 string
 */
export function decodeHex(data: string) {
  const decoded = Buffer.from(data.replace('0x', ''), 'hex').toString('utf8');
  return decoded === '\x00' ? '' : decoded;
}

/**
 * Encode a number into hex, zero-padded to 64 characters (no leading 0x)
 * See https://eips.ethereum.org/EIPS/eip-1155#metadata
 */
export function encodeHexIDForURI(id: string) {
  const encoded = BigInt(id).toString(16);
  const remainingLength = 64 - encoded.length;
  if (remainingLength > 0) {
    return '0'.repeat(remainingLength) + encoded;
  }
  return encoded;
}

export function isFungible(poolId: string) {
  return poolId[0] === 'F';
}

/**
 * Given a pool ID (in format 'F1') and optional token index, compute the
 * token ID according to the split-byte implementation of the underlying contract.
 */
export function packTokenId(poolId: string, tokenIndex = '0') {
  return (
    (BigInt(isFungible(poolId) ? 0 : 1) << BigInt(255)) |
    (BigInt(poolId.substring(1)) << BigInt(128)) |
    BigInt(tokenIndex)
  ).toString();
}

/**
 * Given a token ID from the underlying contract, split it into its meaningful parts.
 */
export function unpackTokenId(id: string) {
  const val = BigInt(id);
  const isFungible = val >> BigInt(255) === BigInt(0);
  return {
    isFungible: isFungible,
    poolId: (isFungible ? 'F' : 'N') + (BigInt.asUintN(255, val) >> BigInt(128)),
    tokenIndex: isFungible ? undefined : BigInt.asUintN(128, val).toString(),
  };
}

/**
 * Given a pool ID (in format 'F1') and optional block number, create a packed
 * string to be used as a pool locator.
 *
 * This should only be called once when the pool is first created! You should
 * never re-pack a locator during event or request processing (always send
 * back the one provided as input or unpacked from the subscription).
 */
export function packPoolLocator(poolId: string, blockNumber?: string) {
  const encoded = new URLSearchParams();
  encoded.set('id', poolId);
  if (blockNumber !== undefined) {
    encoded.set('block', blockNumber);
  }
  return encoded.toString();
}

/**
 * Unpack a pool locator string into its meaningful parts.
 */
export function unpackPoolLocator(data: string): PoolLocator {
  const encoded = new URLSearchParams(data);
  const tokenId = encoded.get('id');
  if (tokenId !== null) {
    return { poolId: tokenId, blockNumber: encoded.get('block') ?? undefined };
  }
  return { poolId: data };
}

export function packStreamName(prefix: string, instancePath: string) {
  return [prefix, instancePath].join(':');
}

export function packSubscriptionName(
  namespace: string | undefined,
  instancePath: string,
  poolLocator: string,
  event: string,
) {
  if (namespace !== undefined) {
    return [SUBSCRIPTION_PREFIX, namespace, instancePath, poolLocator, event].join(':');
  }
  return [SUBSCRIPTION_PREFIX, instancePath, poolLocator, event].join(':');
}

export function unpackSubscriptionName(data: string) {
  const parts = data.split(':');
  if (parts.length === 5 && parts[0] === SUBSCRIPTION_PREFIX) {
    return {
      namespace: parts[1],
      instancePath: parts[2],
      poolLocator: parts[3],
      event: parts[4],
    };
  } else if (parts.length === 4) {
    return {
      namespace: undefined,
      instancePath: parts[1],
      poolLocator: parts[2],
      event: parts[3],
    };
  } else {
    return {};
  }
}
