import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isTest } from './config/env.js';
import { isDatabaseConnected } from './config/db.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { createApiLimiter } from './middlewares/rateLimiters.js';
import { createApiRouter } from './routes/index.js';
import { sendSuccess } from './utils/apiResponse.js';
import { logger } from './utils/logger.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({
      // The mobile app sends no Origin header; browsers are limited to CORS_ORIGINS.
      origin: (origin, callback) => callback(null, !origin || env.CORS_ORIGINS.includes(origin)),
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  if (!isTest) app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => {
    const up = isDatabaseConnected();
    sendSuccess(
      res,
      { status: up ? 'ok' : 'degraded', database: up ? 'up' : 'down' },
      { status: up ? 200 : 503 },
    );
  });

  app.use('/api/v1', createApiLimiter(), createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
