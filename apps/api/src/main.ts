import './instrument';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(cookieParser());
  app.enableCors({ origin: true, credentials: true });

  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/ready', 'docs', 'docs-json'],
  });

  // Back-compat for clients that probe `${API_BASE_URL}/health` (i.e. /api/health).
  const http = app.getHttpAdapter().getInstance();
  http.get('/api/health', (_req: unknown, res: { redirect: (code: number, url: string) => void }) => {
    res.redirect(308, '/health');
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('HiGo Abuja API')
      .setDescription('Mobility module REST API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`Application running on http://localhost:${port}`);
  if (nodeEnv !== 'production') {
    Logger.log(`Swagger docs at http://localhost:${port}/docs`);
  }
}

bootstrap();