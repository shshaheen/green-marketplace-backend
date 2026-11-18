import { pino } from 'pino';
import { env, isProduction, isTest } from '../config/env.js';

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.refreshToken',
      '*.accessToken',
      '*.phone',
      '*.email',
    ],
    censor: '[redacted]',
  },
  ...(isProduction || isTest
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});
