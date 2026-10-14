import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageInfo } from '../lib/info.js';

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

test('lists no sizes for an image that fits in a single tile', () => {
  assert.deepEqual(info(300, 200).sizes, []);
});
