import { createServer } from 'http';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { NestFactory } from '@nestjs/core';
import { envSchema } from './config/env.schema';
import { MatchingModule } from './matching/matching.module';
import { DispatchProcessor } from './matching/dispatch.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validationSchema: envSchema,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        redis: config.getOrThrow<string>('REDIS_URL'),
      }),
      inject: [ConfigService],
    }),
    MatchingModule,
  ],
  providers: [DispatchProcessor],
})
export class WorkerModule {}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn', 'log'],
  });

  Logger.log('Bull dispatch worker started');

  const port = Number(process.env.PORT ?? 3000);
  const healthServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { status: 'ok', role: 'worker' } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  healthServer.listen(port, () => {
    Logger.log(`Worker health endpoint on port ${port}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    healthServer.close();
    Logger.log(`Received ${signal}, shutting down worker...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err: unknown) => {
  Logger.error('Worker failed to start', err);
  process.exit(1);
});