import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-uploads-'));
process.env.UPLOAD_DIR = dir;

const { putImage } = await import('../src/utils/storage/index.js');

test('local driver saves the image and returns a /uploads url', async () => {
  const url = await putImage({
    file: { buffer: Buffer.from('fake'), mimetype: 'image/png' },
    folder: 'products',
    driver: 'local',
  });

  assert.match(url, /^\/uploads\/products\/[0-9a-f-]+\.png$/);
  const saved = await fs.readFile(path.join(dir, url.replace('/uploads/', '')));
  assert.equal(saved.toString(), 'fake');
});

test('it rejects files that are not images', async () => {
  await assert.rejects(
    putImage({ file: { buffer: Buffer.from('x'), mimetype: 'text/html' }, driver: 'local' }),
    /Only jpg, png, webp and gif/,
  );
});
