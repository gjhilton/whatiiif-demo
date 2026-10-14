import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../lib/config.js';
import { buildManifest } from '../lib/manifest.js';
import { schemaProblems, schemaUnavailable } from './support/schema.js';

const base = {
  manifestId: 'https://example.org/site/iiif/manifest.json',
  imageId: 'https://example.org/site/iiif/image',
  pageUrl: 'https://example.org/site/',
  info: {
    width: 4999,
    height: 3001,
    sizes: [
      { width: 313, height: 188 },
      { width: 625, height: 376 },
      { width: 1250, height: 751 },
    ],
  },
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

test('the canvas is labelled with the title, which viewers show beside it', () => {
  assert.deepEqual(buildManifest(base).items[0].label, { en: ['Harbour'] });
});

test('paints the full-size image and points at the image service', () => {
  const painted = painting(buildManifest(base));
  assert.equal(painted.motivation, 'painting');
  assert.equal(painted.body.id, 'https://example.org/site/iiif/image/full/max/0/default.jpg');
  assert.deepEqual(painted.body.service, [{ id: base.imageId, type: 'ImageService3', profile: 'level0' }]);
});

test('paints the largest published size when full/max is not published', () => {
  const { body } = painting(buildManifest({ ...base, hasFull: false }));
  assert.equal(body.id, 'https://example.org/site/iiif/image/full/1250,751/0/default.jpg');
  assert.equal(body.width, 1250);
  assert.equal(body.height, 751);
});

test('uses the smallest size as the thumbnail', () => {
  const [thumb] = buildManifest(base).thumbnail;
  assert.equal(thumb.id, 'https://example.org/site/iiif/image/full/313,188/0/default.jpg');
});

test('links back to the page the image is published on, so a viewer elsewhere can lead people to it', () => {
  assert.deepEqual(buildManifest(base).homepage, [
    { id: 'https://example.org/site/', type: 'Text', label: { en: ['Harbour'] }, format: 'text/html' },
  ]);
});

test('carries summary, attribution, rights and metadata when configured', () => {
  const m = buildManifest({
    ...base,
    config: {
      title: { en: 'Harbour' },
      summary: { en: 'A view.' },
      attribution: { en: 'Example Museum' },
      rights: 'http://creativecommons.org/licenses/by/4.0/',
      metadata: [{ label: { en: 'Date' }, value: { en: '1890' } }],
    },
  });
  assert.deepEqual(m.summary, { en: ['A view.'] });
  assert.deepEqual(m.requiredStatement, { label: { en: ['Attribution'] }, value: { en: ['Example Museum'] } });
  assert.equal(m.rights, 'http://creativecommons.org/licenses/by/4.0/');
  assert.deepEqual(m.metadata, [{ label: { en: ['Date'] }, value: { en: ['1890'] } }]);
});

test('omits optional fields that are not configured', () => {
  const m = buildManifest(base);
  for (const key of ['summary', 'requiredStatement', 'rights', 'metadata', 'rendering']) {
    assert.equal(key in m, false, key);
  }
});

test('links the original file, with its format, when its address is known', () => {
  const m = buildManifest({ ...base, original: { url: 'https://media.githubusercontent.com/media/o/r/main/content/a.tif', format: 'image/tiff' } });
  assert.deepEqual(m.rendering, [
    { id: 'https://media.githubusercontent.com/media/o/r/main/content/a.tif', type: 'Image', label: { en: ['Original file'] }, format: 'image/tiff' },
  ]);
});

test('gives every text in each language it was written in, and our own words in English', () => {
  const m = buildManifest({
    ...base,
    original: { url: 'https://raw.githubusercontent.com/o/r/main/content/a.tif', format: 'image/tiff' },
    config: {
      title: { cy: 'Harbwr', en: 'Harbour' },
      attribution: { cy: 'Amgueddfa' },
      metadata: [{ label: { cy: 'Dyddiad', en: 'Date' }, value: { none: '1890' } }],
    },
  });
  assert.deepEqual(m.label, { cy: ['Harbwr'], en: ['Harbour'] });
  assert.deepEqual(m.homepage[0].label, { cy: ['Harbwr'], en: ['Harbour'] });
  assert.deepEqual(m.requiredStatement, { label: { en: ['Attribution'] }, value: { cy: ['Amgueddfa'] } });
  assert.deepEqual(m.metadata, [{ label: { cy: ['Dyddiad'], en: ['Date'] }, value: { none: ['1890'] } }]);
  assert.deepEqual(m.rendering[0].label, { en: ['Original file'] });
});

// Against the JSON schema of the official IIIF Presentation validator; without a connection these are skipped.
const everySetting = `
language = "cy"
title = { cy = "Harbwr", en = "Harbour" }
summary = "A view."
attribution = "Example Museum"
rights = "https://creativecommons.org/licenses/by/4.0/"

[[metadata]]
label = "Date"
value = "1890"
`;

const cases = {
  'an image with no settings': {},
  'every setting, with a link to the original file': {
    toml: everySetting,
    original: { url: 'https://media.githubusercontent.com/media/gjh/harbour/main/content/Harbour%20view.tif', format: 'image/tiff' },
  },
  'a site without the full-size JPEG': { hasFull: false },
  'an image too small to have other sizes': { info: { width: 300, height: 200, sizes: [] } },
};

for (const [name, { toml = '', ...overrides }] of Object.entries(cases)) {
  test(`the manifest for ${name} passes the IIIF Presentation 3.0 schema`, { skip: schemaUnavailable }, () => {
    const parsed = parseConfig(toml);
    const config = { ...parsed, title: parsed.title ?? { en: 'harbour' } };
    assert.deepEqual(schemaProblems(buildManifest({ ...base, config, ...overrides })), []);
  });
}
