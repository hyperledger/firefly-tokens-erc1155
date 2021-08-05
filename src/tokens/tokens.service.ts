import { HttpService, Injectable } from '@nestjs/common';
import { isFungible, packTokenId, packTokenUri } from '../util';
import { EthConnectAsyncResponse, TokenMint, TokenPool, TokenType } from './tokens.interfaces';

@Injectable()
export class TokensService {
  instanceUrl: string;
  identity: string;

  constructor(private http: HttpService) {}

  configure(instanceUrl: string, identity: string) {
    this.instanceUrl = instanceUrl;
    this.identity = identity;
  }

  private get options() {
    return {
      params: {
        'fly-from': this.identity,
        'fly-sync': 'false',
      },
    };
  }

  async createPool(dto: TokenPool) {
    const response = await this.http
      .post<EthConnectAsyncResponse>(
        `${this.instanceUrl}/create`,
        {
          uri: packTokenUri(dto.namespace, dto.name, dto.client_id),
          is_fungible: dto.type === TokenType.FUNGIBLE,
        },
        this.options,
      )
      .toPromise();
    return response.data;
  }

  async mint(dto: TokenMint) {
    const type_id = packTokenId(dto.pool_id);
    if (isFungible(dto.pool_id)) {
      const response = await this.http
        .post<EthConnectAsyncResponse>(
          `${this.instanceUrl}/mintFungible`,
          {
            type_id,
            to: [dto.to],
            amounts: [dto.amount],
            data: [0],
          },
          this.options,
        )
        .toPromise();
      return response.data;
    } else {
      const to: string[] = [];
      for (let i = 0; i < dto.amount; i++) {
        to.push(dto.to);
      }

      const response = await this.http
        .post<EthConnectAsyncResponse>(
          `${this.instanceUrl}/mintNonFungible`,
          {
            type_id,
            to,
            data: [0],
          },
          this.options,
        )
        .toPromise();
      return response.data;
    }
  }
}
