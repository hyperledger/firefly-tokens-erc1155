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

const BASE_URI = 'fly://erc1155';

export function packTokenUri(namespace: string, name: string, client_id: string) {
  const uri = new URL(BASE_URI);
  uri.pathname = `/${namespace}/${name}/${client_id}`;
  return uri.href;
}

export function unpackTokenUri(uri: string) {
  const parts = new URL(uri).pathname.split('/');
  return {
    namespace: parts[1],
    name: parts[2],
    client_id: parts[3],
  };
}

export function isFungible(pool_id: string) {
  return pool_id[0] === 'F';
}

export function packTokenId(pool_id: string, token_index = '0') {
  return (
    (BigInt(isFungible(pool_id) ? 0 : 1) << BigInt(255)) |
    (BigInt(pool_id.substr(1)) << BigInt(128)) |
    BigInt(token_index)
  ).toString();
}

export function unpackTokenId(id: string) {
  const val = BigInt(id);
  const isFungible = val >> BigInt(255) === BigInt(0);
  return {
    is_fungible: isFungible,
    pool_id: (isFungible ? 'F' : 'N') + (BigInt.asUintN(255, val) >> BigInt(128)),
    token_index: BigInt.asUintN(128, val).toString(),
  };
}
