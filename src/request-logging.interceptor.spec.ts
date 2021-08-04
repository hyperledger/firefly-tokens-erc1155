import { RequestLoggingInterceptor } from './request-logging.interceptor';

describe('RequestLoggingInterceptor', () => {
  it('should be defined', () => {
    expect(new RequestLoggingInterceptor()).toBeDefined();
  });
});
