// Copyright © 2022 Kaleido, Inc.
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

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as LRUCache from 'lru-cache';
import { abi as ERC1155MixedFungibleAbi } from '../abi/ERC1155MixedFungible.json';
import { abi as ERC1155MixedFungibleOldAbi } from '../abi/ERC1155MixedFungibleOld.json';
import { BlockchainConnectorService } from './blockchain.service';
import { SupportsInterface } from './erc165';
import { DynamicMethods } from './erc1155';
import { Context } from '../request-context/request-context.decorator';
import {
  IAbiMethod,
  MethodSignature,
  PoolLocator,
  TokenOperation,
  TokenPool,
  TokenType,
} from './tokens.interfaces';
import { encodeHex } from './tokens.util';

const CUSTOM_URI_IID = '0xa1d87d57';

const tokenCreateFunctionName = 'create';
const tokenCreateEvent = 'TokenPoolCreation';

@Injectable()
export class AbiMapperService {
  private readonly logger = new Logger(AbiMapperService.name);
  private supportCache: LRUCache<string, boolean>;

  constructor(private blockchain: BlockchainConnectorService) {
    this.supportCache = new LRUCache<string, boolean>({ max: 500 });
  }

  allInvokeMethods(abi: IAbiMethod[]) {
    const allSignatures = [
      ...DynamicMethods.approval,
      ...DynamicMethods.burn,
      ...DynamicMethods.mint,
      ...DynamicMethods.transfer,
    ];
    return this.getAllMethods(abi, allSignatures);
  }

  async getAbi(ctx: Context, address: string) {
    const uriSupport = await this.supportsInterface(ctx, address, CUSTOM_URI_IID);
    return uriSupport ? ERC1155MixedFungibleAbi : ERC1155MixedFungibleOldAbi;
  }

  private signatureMatch(method: IAbiMethod, signature: MethodSignature) {
    if (signature.name !== method.name || signature.inputs.length !== method.inputs?.length) {
      return false;
    }
    for (let i = 0; i < signature.inputs.length; i++) {
      if (signature.inputs[i].type !== method.inputs[i].type) {
        return false;
      }
    }
    return true;
  }

  getAllMethods(abi: IAbiMethod[], signatures: MethodSignature[]) {
    const methods: IAbiMethod[] = [];
    for (const signature of signatures) {
      for (const method of abi) {
        if (this.signatureMatch(method, signature)) {
          methods.push(method);
        }
      }
    }
    return methods;
  }

  getMethodAndParams(
    abi: IAbiMethod[],
    poolLocator: PoolLocator,
    operation: TokenOperation,
    dto: any,
  ) {
    const signatures = DynamicMethods[operation];
    for (const signature of signatures) {
      for (const method of abi) {
        if (this.signatureMatch(method, signature)) {
          const params = signature.map(poolLocator, dto);
          if (params !== undefined) {
            return { method, params };
          }
        }
      }
    }
    return {};
  }

  getCreateMethod() {
    return ERC1155MixedFungibleAbi.find(m => m.name === tokenCreateFunctionName);
  }

  getCreateEvent() {
    return ERC1155MixedFungibleAbi.find(m => m.name === tokenCreateEvent);
  }

  getCreateMethodAndParams(dto: TokenPool) {
    const method = this.getCreateMethod();
    if (method === undefined) {
      throw new BadRequestException('Failed to parse contract ABI');
    }
    const params = [dto.type === TokenType.FUNGIBLE, encodeHex(dto.data ?? '')];
    return { method, params };
  }

  private async supportsInterface(ctx: Context, address: string, iid: string) {
    const cacheKey = `${address}:${iid}`;
    const cached = this.supportCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    let support = false;
    try {
      const result = await this.blockchain.query(ctx, address, SupportsInterface, [iid]);
      support = result.output === true;
      this.logger.log(`Querying interface '${iid}' support on contract '${address}': ${support}`);
    } catch (err) {
      this.logger.log(
        `Querying interface '${iid}' support on contract '${address}': failed (assuming false)`,
      );
    }

    this.supportCache.set(cacheKey, support);
    return support;
  }
}
