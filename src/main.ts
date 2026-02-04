import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiConfigService } from './config/api-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Configure CORS using allowed origins from config
  const config = app.get(ApiConfigService);
  const allowedOrigins = config.get('CORS_ALLOWED_ORIGINS');

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }

      // If no origins configured, allow all (development mode)
      if (allowedOrigins.length === 0 || allowedOrigins[0] === '') {
        callback(null, true);
        return;
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
