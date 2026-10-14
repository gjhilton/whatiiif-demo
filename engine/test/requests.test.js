import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedRequests } from '../lib/requests.js';

const info = {
  width: 4999,
  height: 3001,
  tiles: [{ width: 512, scaleFactors: [1, 2, 4, 8, 16] }],
};

test('requests a full-region tile for the level that fits in one tile', () => {
  const paths = expectedRequests(info);
  assert.ok(paths.includes('full/313,188/0/default.jpg'));
});

test('requests edge tiles clipped to the image bounds', () => {
  const paths = expectedRequests(info);
  assert.ok(paths.includes('4096,0,903,3001/113,376/0/default.jpg'));
  assert.ok(paths.includes('0,2560,512,441/512,441/0/default.jpg'));
});

test('requests max for a single-tile image at scale 1', () => {
  const tiny = { width: 300, height: 200, tiles: [{ width: 512, scaleFactors: [1] }] };
  assert.deepEqual(expectedRequests(tiny), ['full/max/0/default.jpg']);
});

test('requests every whole-image size listed in info.json', () => {
  const withSizes = { ...info, sizes: [{ width: 250, height: 150 }] };
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
