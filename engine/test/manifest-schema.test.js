// Checks the manifests we build against the JSON schema of the official IIIF Presentation validator;
// without a connection these tests are skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../lib/config.js';
import { buildManifest } from '../lib/manifest.js';
import { schemaProblems, schemaUnavailable } from './schema.js';

const base = {
  manifestId: 'https://example.org/site/iiif/manifest.json',
  imageId: 'https://example.org/site/iiif/image',
  info: {
    width: 4999,
    height: 3001,
    sizes: [
      { width: 313, height: 188 },
      { width: 625, height: 376 },
      { width: 1250, height: 751 },
    ],
  },
  hasFull: true,
};

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
    originalUrl: 'https://media.githubusercontent.com/media/gjh/harbour/main/content/Harbour%20view.tif',
  },
  'a site without the full-size JPEG': { hasFull: false },
  'an image too small to have other sizes': { info: { width: 300, height: 200, sizes: [] } },
};

for (const [name, { toml = '', ...overrides }] of Object.entries(cases)) {
  test(`the manifest for ${name} passes the IIIF Presentation 3.0 schema`, { skip: schemaUnavailable }, () => {
    const config = parseConfig(toml, { imageName: 'harbour.tif' });
    assert.deepEqual(schemaProblems(buildManifest({ ...base, config, ...overrides })), []);
  });
}
