import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { validate } from '../lib/validate.js';
import { expectedRequests } from '../lib/requests.js';
import { tempDir } from './tmp.js';

const info = {
  '@context': 'http://iiif.io/api/image/3/context.json',
  id: 'https://example.org/img',
  type: 'ImageService3',
  protocol: 'http://iiif.io/api/image',
  profile: 'level0',
  width: 1000,
  height: 700,
  extraFeatures: ['sizeByWh'],
  sizes: [{ width: 250, height: 175 }],
  tiles: [{ width: 512, scaleFactors: [1, 2] }],
};

async function build(overrides = {}, skip = () => false) {
  const dir = await tempDir('validate');
  const merged = { ...info, ...overrides };
  await writeFile(join(dir, 'info.json'), JSON.stringify(merged));
  for (const p of expectedRequests(merged)) {
    if (skip(p)) continue;
    await mkdir(dirname(join(dir, p)), { recursive: true });
    await writeFile(join(dir, p), 'x');
  }
  return dir;
}

test('a complete service has no problems', async () => {
  assert.deepEqual(await validate(await build()), []);
});

test('reports a tile that a viewer would request but is not on disk', async () => {
  const dir = await build({}, (p) => p === 'full/500,350/0/default.jpg');
  const problems = await validate(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /missing tile: full\/500,350\/0\/default\.jpg/);
});

test('reports info.json without sizeByWh, which stops viewers tiling a level0 service', async () => {
  const dir = await build({ extraFeatures: [] });
  const problems = await validate(dir);
  assert.ok(problems.some((p) => /sizeByWh/.test(p)));
});
