import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

export interface StoredImage {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

/** Where uploaded images live. Swappable so tests don't call Cloudinary. */
export interface ImageStorage {
  upload(file: Buffer, options: { folder: string }): Promise<StoredImage>;
  destroy(publicId: string): Promise<void>;
}

function createCloudinaryStorage(): ImageStorage {
  const configured =
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET;

  if (configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  const ensureConfigured = () => {
    if (!configured) throw ApiError.serviceUnavailable('Image storage is not configured');
  };

  return {
    upload(file, { folder }) {
      ensureConfigured();
      return new Promise<StoredImage>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: `${env.CLOUDINARY_FOLDER}/${folder}`,
              resource_type: 'image',
              allowed_formats: ['jpg', 'png', 'webp'],
            },
            (error, result?: UploadApiResponse) => {
              if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
              resolve({
                url: result.secure_url,
                publicId: result.public_id,
                width: result.width,
                height: result.height,
              });
            },
          )
          .end(file);
      });
    },

    async destroy(publicId) {
      ensureConfigured();
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    },
  };
}

let storage: ImageStorage = createCloudinaryStorage();

export function getImageStorage(): ImageStorage {
  return storage;
}

/** For tests only. */
export function setImageStorage(replacement: ImageStorage): void {
  storage = replacement;
}
