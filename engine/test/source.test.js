import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findSourceImage } from '../lib/source.js';
import { tempDir } from './tmp.js';

async function content(...files) {
  const dir = await tempDir('content');
  for (const f of files) await writeFile(join(dir, f), 'x');
  return dir;
}

test('finds the single image and ignores config and docs', async () => {
  const dir = await content('whatiiif.toml', 'description.md', 'harbour.TIF', '.gitkeep');
  assert.equal(await findSourceImage(dir), join(dir, 'harbour.TIF'));
});

test('explains what to do when there is no image', async () => {
  await assert.rejects(findSourceImage(await content('whatiiif.toml')), /no image.*content\/.*tif, png, jpg/i);
});

test('names every file when there is more than one image', async () => {
  await assert.rejects(findSourceImage(await content('a.png', 'b.jpg')), /exactly one.*a\.png.*b\.jpg/is);
});

test('tells the user to convert unsupported formats', async () => {
  await assert.rejects(findSourceImage(await content('scan.jp2')), /scan\.jp2.*not supported.*convert.*tiff/is);
});
