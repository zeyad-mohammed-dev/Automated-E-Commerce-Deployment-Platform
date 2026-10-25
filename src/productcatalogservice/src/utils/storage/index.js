import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { STORAGE_DRIVER } from '../../config/config.js';
import { ValidationError } from '../errors/index.js';
import { putLocal } from './local.storage.js';
import { putS3 } from './s3.storage.js';

const extensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export const allowedImageTypes = Object.keys(extensions);

export const putImage = async ({ file, folder = 'products', driver = STORAGE_DRIVER }) => {
  const ext = extensions[file.mimetype];
  if (!ext) {
    throw new ValidationError({ message: 'Only jpg, png, webp and gif images are allowed' });
  }

  const key = path.posix.join(folder, `${randomUUID()}${ext}`);
  const put = driver === 's3' ? putS3 : putLocal;
  const { url } = await put({ buffer: file.buffer, key, mimetype: file.mimetype });
  return url;
};
