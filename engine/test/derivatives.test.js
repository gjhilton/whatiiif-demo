import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { slice } from '../lib/slice.js';
import { validate } from '../lib/validate.js';
import { makeImage, makeVariant, makeOriented, makeWideGamut, makeGeotagged, inspect, pixel } from './fixtures.js';
import { tempDir } from './tmp.js';

const ID = 'https://example.org/iiif/img';
const exists = (p) => access(p).then(() => true, () => false);
const outDir = () => tempDir('out');
const readInfo = async (dir) => JSON.parse(await readFile(join(dir, 'info.json'), 'utf8'));

// Viewers built on OpenSeadragon 4-5 read `sizes` as the pyramid levels, so that is all the list may hold.
test('lists the smaller pyramid levels, up to 2000 pixels wide, as whole-image sizes', async () => {
  const out = await outDir();
  await slice({ source: await makeImage(4999, 3001), outDir: out, id: ID });
  assert.deepEqual((await readInfo(out)).sizes, [
    { width: 313, height: 188 },
    { width: 625, height: 376 },
    { width: 1250, height: 751 },
  ]);
  assert.deepEqual(await validate(out), []);
});

test('lists no sizes for an image that fits in a single tile', async () => {
  const out = await outDir();
  await slice({ source: await makeImage(300, 200), outDir: out, id: ID });
  assert.deepEqual((await readInfo(out)).sizes, []);
});

test('publishes full/max by default', async () => {
  const out = await outDir();
  await slice({ source: await makeImage(2000, 1500), outDir: out, id: ID });
  assert.ok(await exists(join(out, 'full/max/0/default.jpg')));
});

test('omits full/max when publishFull is false and tiles do not need it', async () => {
  const out = await outDir();
  await slice({ source: await makeImage(2000, 1500), outDir: out, id: ID, publishFull: false });
  assert.equal(await exists(join(out, 'full/max/0/default.jpg')), false);
  assert.deepEqual(await validate(out), []);
});

for (const kind of ['rgb16', 'cmyk', 'grey', 'rgba']) {
  test(`normalises a ${kind} source to 8-bit sRGB tiles`, async () => {
    const out = await outDir();
    await slice({ source: await makeVariant(kind), outDir: out, id: ID });
    const { channels, space, depth } = await inspect(join(out, 'full/max/0/default.jpg'));
    assert.deepEqual({ channels, space, depth }, { channels: 3, space: 'srgb', depth: 'uchar' });
    assert.deepEqual(await validate(out), []);
  });
}

// For a 600x400 file with a block in its stored top-left corner: the upright size, and the corner the block belongs in.
const orientations = [
  [2, 600, 400, 'top-right'],
  [3, 600, 400, 'bottom-right'],
  [4, 600, 400, 'bottom-left'],
  [5, 400, 600, 'top-left'],
  [6, 400, 600, 'top-right'],
  [7, 400, 600, 'bottom-right'],
  [8, 400, 600, 'bottom-left'],
];

for (const [orientation, width, height, corner] of orientations) {
  test(`turns a JPEG with EXIF orientation ${orientation} upright`, async () => {
    const out = await outDir();
    await slice({ source: await makeOriented(orientation), outDir: out, id: ID });

    const info = await readInfo(out);
    assert.deepEqual([info.width, info.height], [width, height]);
    const corners = {
      'top-left': [10, 10],
      'top-right': [width - 10, 10],
      'bottom-left': [10, height - 10],
      'bottom-right': [width - 10, height - 10],
    };
    for (const [name, [x, y]] of Object.entries(corners)) {
      const [red] = await pixel(join(out, 'full/max/0/default.jpg'), x, y);
      assert.equal(red > 128, name === corner, `${name} corner`);
    }
    assert.deepEqual(await validate(out), []);
  });
}

test('leaves no EXIF rotation on published images, which browsers would apply a second time', async () => {
  const out = await outDir();
  await slice({ source: await makeOriented(6), outDir: out, id: ID });
  for (const path of ['full/max/0/default.jpg', 'full/200,300/0/default.jpg']) {
    assert.equal((await inspect(join(out, path))).orientation, 1, path);
  }
});

test('applies an embedded colour profile, so a wide-gamut source shows the same colours at every zoom', async () => {
  const out = await outDir();
  await slice({ source: await makeWideGamut(), outDir: out, id: ID });
  for (const path of ['0,0,512,500/512,500/0/default.jpg', 'full/350,250/0/default.jpg', 'full/max/0/default.jpg']) {
    const shown = await pixel(join(out, path), 10, 10);
    for (const [i, want] of [200, 60, 40].entries()) {
      assert.ok(Math.abs(shown[i] - want) <= 4, `${path} shows ${shown}, not 200,60,40`);
    }
  }
});

test('publishes none of the EXIF a camera wrote, such as where the photo was taken', async () => {
  const out = await outDir();
  await slice({ source: await makeGeotagged(), outDir: out, id: ID });
  for (const path of ['full/max/0/default.jpg', 'full/350,250/0/default.jpg', '0,0,512,500/512,500/0/default.jpg']) {
    assert.equal((await inspect(join(out, path))).exif, false, path);
  }
});
