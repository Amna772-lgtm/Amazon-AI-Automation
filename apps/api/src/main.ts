import 'reflect-metadata';
import { loadRootEnv } from '@app/core';
loadRootEnv();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadConfig } from './config';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  configureApp(app, config);
  await app.listen(config.API_PORT);
  console.log(`API listening on http://localhost:${config.API_PORT}/api`);
}

void bootstrap();
