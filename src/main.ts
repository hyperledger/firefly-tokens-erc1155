import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { version as API_VERSION } from '../package.json';
import { AppModule } from './app.module';
import { EventStreamService } from './event-stream/event-stream.service';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { TokensService } from './tokens/tokens.service';

const subscriptions = ['URI', 'TransferSingle'];

export function getApiConfig() {
  return new DocumentBuilder().setTitle('FireFly Tokens - ERC1155').setVersion(API_VERSION).build();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  const apiConfig = getApiConfig();
  const api = SwaggerModule.createDocument(app, apiConfig);
  const config = app.get(ConfigService);

  SwaggerModule.setup('api', app, api);

  const ethConnectUrl = config.get<string>('ETHCONNECT_URL', '');
  const instancePath = config.get<string>('ETHCONNECT_INSTANCE', '');
  const topic = config.get<string>('ETHCONNECT_TOPIC', '');
  const identity = config.get<string>('ETHCONNECT_IDENTITY', '');

  const instanceUrl = ethConnectUrl + instancePath;
  const wsUrl = ethConnectUrl.replace('http', 'ws') + '/ws';

  const eventStream = app.get(EventStreamService);
  const stream = await eventStream.ensureEventStream(ethConnectUrl, topic);
  await eventStream.ensureSubscriptions(ethConnectUrl, instanceUrl, stream.id, subscriptions);
  eventStream.initWebsocket(wsUrl, topic);

  const tokens = app.get(TokensService);
  tokens.init(instanceUrl, identity);

  const port = config.get<number>('PORT', 3000);
  console.log(`Listening on port ${port}`);
  await app.listen(port);
}

bootstrap().catch(err => {
  console.error(`Fatal error: ${err}`);
});
