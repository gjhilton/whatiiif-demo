import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest } from '../lib/manifest.js';

const info = {
  width: 4999,
  height: 3001,
  sizes: [
    { width: 200, height: 120 },
    { width: 1000, height: 600 },
  ],
};
const base = {
  manifestId: 'https://example.org/site/iiif/manifest.json',
  imageId: 'https://example.org/site/iiif/image',
  info,
  config: { title: { en: 'Harbour' }, metadata: [] },
  hasFull: true,
};
const painting = (m) => m.items[0].items[0].items[0];

test('is a Presentation 3.0 manifest with one canvas sized like the image', () => {
  const m = buildManifest(base);
  assert.equal(m['@context'], 'http://iiif.io/api/presentation/3/context.json');
  assert.equal(m.type, 'Manifest');
  assert.equal(m.id, base.manifestId);
  assert.deepEqual(m.label, { en: ['Harbour'] });
  assert.equal(m.items.length, 1);
  assert.equal(m.items[0].type, 'Canvas');
  assert.equal(m.items[0].width, 4999);
  assert.equal(m.items[0].height, 3001);
});

test('paints the full-size image and points at the image service', () => {
  const body = painting(buildManifest(base)).body;
  assert.equal(painting(buildManifest(base)).motivation, 'painting');
  assert.equal(body.id, 'https://example.org/site/iiif/image/full/max/0/default.jpg');
  assert.deepEqual(body.service, [{ id: base.imageId, type: 'ImageService3', profile: 'level0' }]);
});

test('paints the largest published size when full/max is not published', () => {
  const body = painting(buildManifest({ ...base, hasFull: false })).body;
  assert.equal(body.id, 'https://example.org/site/iiif/image/full/1000,600/0/default.jpg');
  assert.equal(body.width, 1000);
  assert.equal(body.height, 600);
});

test('uses the smallest size as the thumbnail', () => {
  const [thumb] = buildManifest(base).thumbnail;
  assert.equal(thumb.id, 'https://example.org/site/iiif/image/full/200,120/0/default.jpg');
});

test('carries summary, attribution, rights and metadata when configured', () => {
  const m = buildManifest({
    ...base,
    config: {
      title: { en: 'Harbour' },
      summary: { en: 'A view.' },
      attribution: { en: 'Example Museum' },
      rights: 'https://creativecommons.org/licenses/by/4.0/',
      metadata: [{ label: { en: 'Date' }, value: { en: '1890' } }],
    },
  });
  assert.deepEqual(m.summary, { en: ['A view.'] });
  assert.deepEqual(m.requiredStatement, { label: { en: ['Attribution'] }, value: { en: ['Example Museum'] } });
  assert.equal(m.rights, 'https://creativecommons.org/licenses/by/4.0/');
  assert.deepEqual(m.metadata, [{ label: { en: ['Date'] }, value: { en: ['1890'] } }]);
});

test('omits optional fields that are not configured', () => {
  const m = buildManifest(base);
  for (const key of ['summary', 'requiredStatement', 'rights', 'metadata', 'rendering']) {
    assert.equal(key in m, false, key);
  }
});

test('links the original file as a rendering when its URL is known', () => {
  const m = buildManifest({ ...base, originalUrl: 'https://media.githubusercontent.com/media/o/r/main/content/a.tif' });
  assert.deepEqual(m.rendering, [
    { id: 'https://media.githubusercontent.com/media/o/r/main/content/a.tif', type: 'Image', label: { en: ['Original file'] } },
  ]);
});

test('gives every text in each language it was written in, and our own words in English', () => {
  const m = buildManifest({
    ...base,
    originalUrl: 'https://raw.githubusercontent.com/o/r/main/content/a.tif',
    config: {
      title: { cy: 'Harbwr', en: 'Harbour' },
      attribution: { cy: 'Amgueddfa' },
      metadata: [{ label: { cy: 'Dyddiad', en: 'Date' }, value: { none: '1890' } }],
    },
  });
  assert.deepEqual(m.label, { cy: ['Harbwr'], en: ['Harbour'] });
  assert.deepEqual(m.requiredStatement, { label: { en: ['Attribution'] }, value: { cy: ['Amgueddfa'] } });
  assert.deepEqual(m.metadata, [{ label: { cy: ['Dyddiad'], en: ['Date'] }, value: { none: ['1890'] } }]);
  assert.deepEqual(m.rendering[0].label, { en: ['Original file'] });
});
