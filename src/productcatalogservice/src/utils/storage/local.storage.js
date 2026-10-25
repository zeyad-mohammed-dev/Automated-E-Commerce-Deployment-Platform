import fs from 'node:fs/promises';
import path from 'node:path';
import { UPLOAD_DIR } from '../../config/config.js';

export const putLocal = async ({ buffer, key }) => {
  const filePath = path.join(UPLOAD_DIR, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
  return { url: `/uploads/${key}` };
};
