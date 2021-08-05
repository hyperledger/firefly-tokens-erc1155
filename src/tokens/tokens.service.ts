import { HttpService, Injectable } from '@nestjs/common';
import { EthConnectAsyncResponse, TokenPool, TokenType } from './tokens.interfaces';

const URI_PREFIX = 'fly://erc1155';

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

  private buildUri(namespace: string, name: string, id: string) {
    return `${URI_PREFIX}/${namespace}/${name}/${id}`;
  }

  async createPool(dto: TokenPool) {
    const response = await this.http
      .post<EthConnectAsyncResponse>(
        `${this.instanceUrl}/create`,
        {
          uri: this.buildUri(dto.namespace, dto.name, dto.id),
          is_fungible: dto.type === TokenType.FUNGIBLE,
        },
        this.options,
      )
      .toPromise();
    return response.data;
  }
}
