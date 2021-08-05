import { HttpService, Injectable } from '@nestjs/common';
import { EthConnectAsyncResponse, TokenPool, TokenType } from './tokens.interfaces';

@Injectable()
export class TokensService {
  instanceUrl: string;
  identity: string;

  constructor(private http: HttpService) {}

  init(instanceUrl: string, identity: string) {
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
          uri: dto.base_uri,
          is_fungible: dto.type === TokenType.FUNGIBLE,
        },
        this.options,
      )
      .toPromise();
    return response.data;
  }
}
