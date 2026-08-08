import './instrument';
import { join } from 'path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

// Tesseract.js spawns a node:worker_threads Worker whose entry script doesn't
// resolve correctly under this webpack/Docker bundling (see OcrService). That
// failure surfaces as an async 'error' event on the worker, which Node
// reports as an uncaughtException *outside* OcrService's own try/catch,
// killing the whole process. OCR is already best-effort (KYC upload works
// fine without it), so this specific, well-understood failure should never
// take the API down - anything else still crashes normally.
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'MODULE_NOT_FOUND' && err.message?.includes('worker-script')) {
    Logger.error(
      `Tesseract OCR worker failed to load (known bundling issue) - OCR unavailable, API continuing: ${err.message}`,
    );
    return;
  }
  Logger.error('Uncaught exception, exiting', err.stack);
  process.exit(1);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(cookieParser());
  // CORS — explicit allowlist of trusted origins (never reflect arbitrary origins)
  const allowedOrigins = [
    'https://www.hiconnectgo.com',
    'https://hiconnectgo.com',
    'https://admin-production-13cc.up.railway.app',
    'http://localhost:5173',   // Vite dev server
    'http://localhost:4200',   // Angular dev server (legacy)
  ];
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  });

  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/ready', 'docs', 'docs-json', 'downloads/HiGO-Passenger.apk'],
  });

  // Back-compat for clients that probe `${API_BASE_URL}/health` (i.e. /api/health).
  const http = app.getHttpAdapter().getInstance();
  http.get('/api/health', (_req: unknown, res: { redirect: (code: number, url: string) => void }) => {
    res.redirect(308, '/health');
  });

  // Direct APK download — interim distribution while the Play Store listing is pending.
  http.get(
    '/downloads/HiGO-Passenger.apk',
    (_req: unknown, res: { sendFile: (path: string) => void }) => {
      res.sendFile(join(__dirname, '..', 'static', 'downloads', 'HiGO-Passenger.apk'));
    },
  );

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
      .setTitle('HiGO Abuja API')
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