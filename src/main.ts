import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { version as API_VERSION } from '../package.json';
import { AppModule } from './app.module';
import { EventStreamService } from './event-stream/event-stream.service';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

const ethConnectUrl = 'http://127.0.0.1:5102';
const instanceUrl = `${ethConnectUrl}/contracts/tokens`;
const wsUrl = ethConnectUrl.replace('http', 'ws') + '/ws';
const topic = 'token';
const subscriptions = ['URI', 'TransferSingle'];

export function getApiConfig() {
  return new DocumentBuilder().setTitle('FireFly Tokens - ERC1155').setVersion(API_VERSION).build();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  const apiConfig = getApiConfig();
  const api = SwaggerModule.createDocument(app, apiConfig);
  SwaggerModule.setup('api', app, api);

  const eventStream = app.get(EventStreamService);
  const stream = await eventStream.ensureEventStream(ethConnectUrl, topic);
  await eventStream.ensureSubscriptions(ethConnectUrl, instanceUrl, stream.id, subscriptions);
  eventStream.initWebsocket(wsUrl, topic);

  await app.listen(3000);
}

bootstrap().catch(err => {
  console.error(`Fatal error: ${err}`);
});
