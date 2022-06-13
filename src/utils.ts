import { InternalServerErrorException } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';

export const basicAuth = (username: string, password: string) => {
  const requestOptions: AxiosRequestConfig = {};
  if (username !== '' && password !== '') {
    requestOptions.auth = {
      username: username,
      password: password,
    };
  }
  return requestOptions;
};

export const topicName = (topicPrefix?: string, namespace?: string) => {
  if (topicPrefix === undefined || topicPrefix === '') {
    return namespace ?? 'token';
  }
  if (topicPrefix.indexOf(':') >= 0) {
    throw new InternalServerErrorException('Invalid characters in topic name');
  }
  if (namespace === undefined) {
    return topicPrefix;
  }
  return topicPrefix + ':' + namespace;
};
