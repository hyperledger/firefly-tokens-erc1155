import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { version as API_VERSION } from '../package.json';
import { AppModule } from './app.module';

export function getApiConfig() {
  return new DocumentBuilder().setTitle('FireFly Tokens - ERC1155').setVersion(API_VERSION).build();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const apiConfig = getApiConfig();
  const api = SwaggerModule.createDocument(app, apiConfig);
  SwaggerModule.setup('api', app, api);
  await app.listen(3000);
}

bootstrap().catch(err => {
  console.error(`Fatal error: ${err}`);
});
