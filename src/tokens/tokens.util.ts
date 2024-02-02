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

import { PoolLocator, TokenLocator, TokenType } from './tokens.interfaces';

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

/**
 * Given a pool locator and optional token index, compute the full token ID.
 */
export function computeTokenId(pool: PoolLocator, tokenIndex = '0') {
  return (BigInt(pool.startId) | BigInt(tokenIndex)).toString(10);
}

/**
 * Given a pool locator and a token ID from the contract, compute the token index.
 */
export function computeTokenIndex(pool: PoolLocator, id: string) {
  return (BigInt(id) - BigInt(pool.startId)).toString(10);
}

/**
 * Given a token type ID from the sample contract, split it into its meaningful parts.
 */
export function unpackTypeId(id: string): TokenLocator {
  const val = BigInt(id);
  const tokenIndex = BigInt.asUintN(128, val);
  const isFungible = val >> BigInt(255) === BigInt(0);
  const startId = val - tokenIndex;
  return {
    ...formatLegacyPool(isFungible, startId),
    tokenIndex: isFungible ? undefined : tokenIndex.toString(10),
  };
}

/**
 * Given a token ID from the underlying contract, split it into its meaningful parts.
 */
export function unpackOldTypeId(id: string) {
  const val = BigInt(id);
  const isFungible = val >> BigInt(255) === BigInt(0);
  return {
    isFungible: isFungible,
    poolId: (isFungible ? 'F' : 'N') + (BigInt.asUintN(255, val) >> BigInt(128)),
    tokenIndex: isFungible ? undefined : BigInt.asUintN(128, val).toString(),
  };
}

/**
 * Given individual pool parameters, create a packed string to be used as a pool locator.
 *
 * This should only be called once when the pool is first created! You should
 * never re-pack a locator during event or request processing (always send
 * back the one provided as input or unpacked from the subscription).
 */
export function packPoolLocator(
  address: string,
  isFungible: boolean,
  poolStartId: string,
  poolEndId: string,
  blockNumber?: string,
) {
  const encoded = new URLSearchParams();
  encoded.set('address', address);
  encoded.set('type', isFungible ? TokenType.FUNGIBLE : TokenType.NONFUNGIBLE);
  encoded.set('startId', poolStartId);
  encoded.set('endId', poolEndId);
  if (blockNumber !== undefined) {
    encoded.set('block', blockNumber);
  }
  return encoded.toString();
}

/**
 * Given a pool ID (in format 'F1') and optional block number, create a packed
 * string to be used as a pool locator.
 *
 * This should only be called once when the pool is first created! You should
 * never re-pack a locator during event or request processing (always send
 * back the one provided as input or unpacked from the subscription).
 */
export function packOldPoolLocator(address: string, poolId: string, blockNumber?: string) {
  const encoded = new URLSearchParams();
  encoded.set('address', address);
  encoded.set('id', poolId);
  if (blockNumber !== undefined) {
    encoded.set('block', blockNumber);
  }
  return encoded.toString();
}

/**
 * Unpack a pool locator string into its meaningful parts.
 * Fall back to various ways that pool locators have been encoded historically.
 */
export function unpackPoolLocator(data: string): PoolLocator {
  const encoded = new URLSearchParams(data);
  const startId = encoded.get('startId');
  const endId = encoded.get('endId');
  if (startId !== null && endId !== null) {
    return {
      startId,
      endId,
      isFungible: encoded.get('type') === TokenType.FUNGIBLE,
      blockNumber: encoded.get('block') ?? undefined,
      address: encoded.get('address') ?? undefined,
    };
  }

  const tokenId = encoded.get('id');
  if (tokenId !== null) {
    return {
      ...convertLegacyPoolId(tokenId),
      blockNumber: encoded.get('block') ?? undefined,
      address: encoded.get('address') ?? undefined,
    };
  }

  return convertLegacyPoolId(data);
}

/**
 * Legacy pool IDs were represented as a compact string such as "F1" or "N2".
 * First character 'F' means 0 in bit 255, 'N' means 1 in bit 255.
 * Remaining string is a decimal number which should be bit-shifted into the high
 * 128 bits of the token ID space (leaving the low 128 bits zeroed).
 */
export function convertLegacyPoolId(poolId: string): PoolLocator {
  const isFungible = poolId[0] === 'F';
  const startId =
    (BigInt(isFungible ? 0 : 1) << BigInt(255)) | (BigInt(poolId.substring(1)) << BigInt(128));
  return formatLegacyPool(isFungible, startId);
}

/**
 * Compute the size of a legacy pool.
 * Fungible token pools use only a single index, while non-fungible pools use
 * the lower 128 bits of the token ID to allocate token indexes.
 */
export function formatLegacyPool(isFungible: boolean, startId: bigint): PoolLocator {
  const poolSize = isFungible ? BigInt(1) : BigInt(1) << BigInt(128);
  return {
    isFungible,
    startId: '0x' + startId.toString(16),
    endId: '0x' + (startId + poolSize - BigInt(1)).toString(16),
  };
}

export function poolContainsId(pool: PoolLocator, id: string) {
  return BigInt(pool.startId) <= BigInt(id) && BigInt(pool.endId) >= BigInt(id);
}

export function packStreamName(prefix: string, instancePath: string) {
  return [prefix, instancePath].join(':');
}

export function packSubscriptionName(
  address: string,
  poolLocator: string,
  event: string,
  poolData?: string,
) {
  if (poolData !== undefined) {
    return [SUBSCRIPTION_PREFIX, address, poolLocator, event, encodeURIComponent(poolData)].join(
      ':',
    );
  }
  return [SUBSCRIPTION_PREFIX, address, poolLocator, event].join(':');
}

export function unpackSubscriptionName(data: string) {
  const parts = data.split(':');
  if (parts.length === 5 && parts[0] === SUBSCRIPTION_PREFIX) {
    return {
      address: parts[1],
      poolLocator: parts[2],
      event: parts[3],
      poolData: decodeURIComponent(parts[4]),
    };
  } else if (parts.length === 4) {
    return {
      address: parts[1],
      poolLocator: parts[2],
      event: parts[3],
      poolData: undefined,
    };
  } else {
    return {};
  }
}
