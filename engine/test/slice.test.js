import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { slice } from '../lib/slice.js';
import { validate } from '../lib/validate.js';
import { makeImage } from './fixtures.js';
import { tempDir } from './tmp.js';

// Awkward sizes: prime-ish, exact tile multiple, single tile, 1 pixel, extreme aspect ratio.
const sizes = [[4999, 3001], [1024, 1024], [300, 200], [1, 1], [2000, 37], [513, 513]];

for (const [w, h] of sizes) {
  test(`slices a ${w}x${h} image into a service viewers can fully load`, async () => {
    const source = await makeImage(w, h);
    const out = await tempDir('out');
    await slice({ source, outDir: out, id: 'https://example.org/iiif/img', tileSize: 512 });

    assert.deepEqual(await validate(out), []);
    const info = JSON.parse(await readFile(join(out, 'info.json'), 'utf8'));
    assert.equal(info.id, 'https://example.org/iiif/img');
    assert.equal(info.width, w);
    assert.equal(info.height, h);
  });
}
