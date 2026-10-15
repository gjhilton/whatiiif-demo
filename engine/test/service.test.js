import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { expectedRequests, imageInfo, missingFiles } from '../lib/service.js';
import { tempDir } from './support/tmp.js';

const info = (width, height) => imageInfo({ id: 'https://example.org/iiif/image', width, height, tileSize: 512 });

test('describes a static level 0 service in full', () => {
  assert.deepEqual(info(4999, 3001), {
    '@context': 'http://iiif.io/api/image/3/context.json',
    id: 'https://example.org/iiif/image',
    type: 'ImageService3',
    protocol: 'http://iiif.io/api/image',
    profile: 'level0',
    width: 4999,
    height: 3001,
    extraFeatures: ['sizeByWh'],
    tiles: [{ width: 512, scaleFactors: [1, 2, 4, 8, 16] }],
    sizes: [
      { width: 313, height: 188 },
      { width: 625, height: 376 },
      { width: 1250, height: 751 },
    ],
  });
});

// The pyramid is halved until the whole image fits one tile. libvips versions disagree on listing
// that last level (8.15 leaves it out, 8.18 lists it), so its depth is decided here.
const pyramids = [
  [4999, 3001, [1, 2, 4, 8, 16]],
  [400, 600, [1, 2]],
  [1024, 1024, [1, 2]],
  [2000, 37, [1, 2, 4]],
  [512, 512, [1]],
  [1, 1, [1]],
];

for (const [width, height, factors] of pyramids) {
  test(`a ${width}x${height} image has the scale factors ${factors.join(', ')}`, () => {
    assert.deepEqual(info(width, height).tiles[0].scaleFactors, factors);
  });
}

// Viewers built on OpenSeadragon 4-5 read `sizes` as the pyramid levels, so that is all the list may hold.
test('lists only pyramid levels as sizes, smallest first, and none wider than 2000 pixels', () => {
  assert.deepEqual(info(12000, 8000).sizes, [
    { width: 375, height: 250 },
    { width: 750, height: 500 },
    { width: 1500, height: 1000 },
  ]);
});

test('lists no size longer than 2000 pixels on either side, so a tall scroll has small renditions too', () => {
  assert.deepEqual(info(1000, 40000).sizes, [
    { width: 8, height: 313 },
    { width: 16, height: 625 },
    { width: 32, height: 1250 },
  ]);
});

test('lists the smallest level even when it is longer than 2000 pixels, so a picture cut into big tiles has a whole-picture rendition', () => {
  assert.deepEqual(imageInfo({ id: 'https://example.org/iiif/image', width: 4100, height: 100, tileSize: 2100 }).sizes, [{ width: 2050, height: 50 }]);
});

test('lists no sizes for an image that fits in a single tile', () => {
  assert.deepEqual(info(300, 200).sizes, []);
});

const service = { width: 4999, height: 3001, tiles: [{ width: 512, scaleFactors: [1, 2, 4, 8, 16] }] };

test('a viewer asks for the level that fits in one tile as a whole image', () => {
  assert.ok(expectedRequests(service).includes('full/313,188/0/default.jpg'));
});

test('a viewer asks for edge tiles clipped to the image bounds', () => {
  const paths = expectedRequests(service);
  assert.ok(paths.includes('4096,0,903,3001/113,376/0/default.jpg'));
  assert.ok(paths.includes('0,2560,512,441/512,441/0/default.jpg'));
});

test('a viewer asks for max for a single-tile image at scale 1', () => {
  const tiny = { width: 300, height: 200, tiles: [{ width: 512, scaleFactors: [1] }] };
  assert.deepEqual(expectedRequests(tiny), ['full/max/0/default.jpg']);
});

test('a viewer may ask for every whole-image size listed in info.json', () => {
  const withSizes = { ...service, sizes: [{ width: 250, height: 150 }] };
  assert.ok(expectedRequests(withSizes).includes('full/250,150/0/default.jpg'));
});

const pyramid = { width: 3000, height: 2000, tiles: [{ width: 512, scaleFactors: [1, 2, 4, 8] }] };

test('also expects the tiles OpenSeadragon 4-5 asks for when it takes `sizes` for the pyramid levels', () => {
  // Seen from Mirador 4: three sizes and a three-step pyramid make it size the quarter-scale level 1000x667, not 750x500.
  const sizes = [
    { width: 200, height: 133 },
    { width: 1000, height: 667 },
    { width: 2000, height: 1333 },
  ];
  const paths = expectedRequests({ ...pyramid, sizes });
  assert.ok(paths.includes('0,0,2048,2000/512,512/0/default.jpg'));
  assert.ok(paths.includes('2048,0,952,2000/488,512/0/default.jpg'));
});

test('expects nothing extra when `sizes` really are the pyramid levels', () => {
  const sizes = [
    { width: 375, height: 250 },
    { width: 750, height: 500 },
    { width: 1500, height: 1000 },
  ];
  // 24 + 6 + 2 tiles and one whole image for the four levels, plus the two sizes that are not already a tile request.
  assert.equal(expectedRequests({ ...pyramid, sizes }).length, 35);
});

/** A service folder holding the info.json for a 1000x700 image and every file it implies, except those `leaveOut` names. */
async function serviceFolder(leaveOut = () => false) {
  const dir = await tempDir('service');
  const described = info(1000, 700);
  await writeFile(join(dir, 'info.json'), JSON.stringify(described));
  for (const path of expectedRequests(described).filter((path) => !leaveOut(path))) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), 'x');
  }
  return dir;
}

test('a folder holding every file its info.json implies is missing nothing', async () => {
  assert.deepEqual(await missingFiles(await serviceFolder()), []);
});

test('names each file a viewer would ask for that is not in the folder', async () => {
  assert.deepEqual(await missingFiles(await serviceFolder((path) => path === 'full/500,350/0/default.jpg')), ['full/500,350/0/default.jpg']);
});
