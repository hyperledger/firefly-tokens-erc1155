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

import { ClientRequest } from 'http';
import { HttpService } from '@nestjs/axios';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { EventStreamReply } from '../event-stream/event-stream.interfaces';
import { basicAuth } from '../utils';
import { Context } from '../request-context/request-context.decorator';
import { FFRequestIDHeader } from '../request-context/constants';
import {
  ContractInfoResponse,
  EthConnectAsyncResponse,
  EthConnectReturn,
  IAbiMethod,
} from './tokens.interfaces';

const sendTransactionHeader = 'SendTransaction';
const queryHeader = 'Query';

@Injectable()
export class BlockchainConnectorService {
  private readonly logger = new Logger(BlockchainConnectorService.name);

  baseUrl: string;
  username: string;
  password: string;
  passthroughHeaders: string[];

  constructor(private http: HttpService) {}

  configure(baseUrl: string, username: string, password: string, passthroughHeaders: string[]) {
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;
    this.passthroughHeaders = passthroughHeaders;
  }

  private requestOptions(ctx: Context): AxiosRequestConfig {
    const headers = {};
    for (const key of this.passthroughHeaders) {
      const value = ctx.headers[key];
      if (value !== undefined) {
        headers[key] = value;
      }
    }
    headers[FFRequestIDHeader] = ctx.requestId;
    const config = basicAuth(this.username, this.password);
    config.headers = headers;
    return config;
  }

  private async wrapError<T>(response: Promise<AxiosResponse<T>>) {
    return response.catch(err => {
      if (axios.isAxiosError(err)) {
        const request: ClientRequest | undefined = err.request;
        const response: AxiosResponse | undefined = err.response;
        const errorMessage = response?.data?.error ?? err.message;
        this.logger.warn(
          `${request?.path} <-- HTTP ${response?.status} ${response?.statusText}: ${errorMessage}`,
        );
        throw new InternalServerErrorException(errorMessage);
      }
      throw err;
    });
  }

  async getContractInfo(ctx: Context, url: string) {
    const response = await this.wrapError(
      lastValueFrom(this.http.get<ContractInfoResponse>(url, this.requestOptions(ctx))),
    );
    return response.data;
  }

  async query(ctx: Context, to: string, method?: IAbiMethod, params?: any[]) {
    const response = await this.wrapError(
      lastValueFrom(
        this.http.post<EthConnectReturn>(
          this.baseUrl,
          { headers: { type: queryHeader }, to, method, params },
          this.requestOptions(ctx),
        ),
      ),
    );
    return response.data;
  }

  async sendTransaction(
    ctx: Context,
    from: string,
    to: string,
    id?: string,
    method?: IAbiMethod,
    params?: any[],
  ) {
    const response = await this.wrapError(
      lastValueFrom(
        this.http.post<EthConnectAsyncResponse>(
          this.baseUrl,
          {
            headers: { id, type: sendTransactionHeader },
            from,
            to,
            method,
            params,
          },
          this.requestOptions(ctx),
        ),
      ),
    );
    return response.data;
  }

  async getReceipt(id: string): Promise<EventStreamReply> {
    const response = await this.wrapError(
      lastValueFrom(
        this.http.get<EventStreamReply>(new URL(`/reply/${id}`, this.baseUrl).href, {
          validateStatus: status => status < 300 || status === 404,
          ...basicAuth(this.username, this.password),
        }),
      ),
    );
    if (response.status === 404) {
      throw new NotFoundException();
    }
    return response.data;
  }
}
