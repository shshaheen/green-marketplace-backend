import type { RequestHandler } from 'express';
import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Checks the file's leading bytes, since the client-sent MIME type can be anything. */
export function hasImageSignature(buffer: Buffer): boolean {
  const isJpeg =
    buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return isJpeg || isPng || isWebp;
}

/**
 * Accepts up to `maxFiles` JPEG/PNG/WebP images (5 MB each) in the multipart field
 * `fieldName`, held in memory. Rejects files whose contents are not really images.
 */
export function imageUpload(fieldName: string, maxFiles: number): RequestHandler[] {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: maxFiles, fields: 10 },
    fileFilter: (_req, file, callback) => {
      if (ALLOWED_MIME_TYPES.has(file.mimetype)) return callback(null, true);
      callback(ApiError.badRequest('Only JPEG, PNG and WebP images are allowed'));
    },
  }).array(fieldName, maxFiles);

  const verify: RequestHandler = (req, _res, next) => {
    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) {
      return next(ApiError.badRequest(`Attach at least one image in the "${fieldName}" field`));
    }
    if (files.some((file) => !hasImageSignature(file.buffer))) {
      return next(ApiError.badRequest('Only JPEG, PNG and WebP images are allowed'));
    }
    next();
  };

  return [parse, verify];
}
