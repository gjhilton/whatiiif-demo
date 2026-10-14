import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../lib/config.js';

const opts = { imageName: 'harbour-1890.tif' };

test('an empty config gets defaults, with the title taken from the image filename', () => {
  const c = parseConfig('', opts);
  assert.equal(c.language, 'en');
  assert.deepEqual(c.title, { en: 'harbour-1890' });
  assert.equal(c.viewer, 'openseadragon');
  assert.equal(c.tiles.size, 512);
  assert.equal(c.tiles.quality, 85);
  assert.equal(c.publish.full, true);
  assert.deepEqual(c.metadata, []);
});

test('reads every documented field', () => {
  const c = parseConfig(
    `
title = "Harbour"
summary = "A view."
attribution = "Example Museum"
rights = "https://creativecommons.org/licenses/by/4.0/"
viewer = "mirador"
base_url = "https://iiif.example.org/"

[[metadata]]
label = "Date"
value = "1890"

[tiles]
size = 256
quality = 70

[publish]
full = false
`,
    opts,
  );
  assert.deepEqual(c.title, { en: 'Harbour' });
  assert.deepEqual(c.attribution, { en: 'Example Museum' });
  assert.equal(c.viewer, 'mirador');
  assert.equal(c.base_url, 'https://iiif.example.org');
  assert.deepEqual(c.metadata, [{ label: { en: 'Date' }, value: { en: '1890' } }]);
  assert.equal(c.tiles.size, 256);
  assert.equal(c.publish.full, false);
});

test('rejects a rights value that is not a URL, naming the field', () => {
  assert.throws(() => parseConfig('rights = "CC-BY"', opts), /rights.*URL/);
});

test('rejects an unknown viewer and lists the valid ones', () => {
  assert.throws(() => parseConfig('viewer = "uv"', opts), /viewer.*openseadragon, mirador/);
});

test('rejects unknown keys so typos are not silently ignored', () => {
  assert.throws(() => parseConfig('titel = "x"', opts), /unknown.*titel/i);
});

test('rejects a tile size that is not a positive integer', () => {
  assert.throws(() => parseConfig('[tiles]\nsize = 0', opts), /tiles\.size/);
});

test('reports TOML syntax errors in plain English', () => {
  assert.throws(() => parseConfig('title = ', opts), /whatiiif\.toml.*not valid TOML/);
});

// IIIF (and its schema) only accept these URIs in the http:// form their publishers define, but people paste https.
const rights = [
  ['https://creativecommons.org/licenses/by/4.0/', 'http://creativecommons.org/licenses/by/4.0/'],
  ['https://www.creativecommons.org/licenses/by-sa/4.0/', 'http://creativecommons.org/licenses/by-sa/4.0/'],
  ['https://creativecommons.org/publicdomain/zero/1.0/', 'http://creativecommons.org/publicdomain/zero/1.0/'],
  ['https://rightsstatements.org/vocab/InC/1.0/', 'http://rightsstatements.org/vocab/InC/1.0/'],
  ['http://creativecommons.org/licenses/by-nc/4.0/', 'http://creativecommons.org/licenses/by-nc/4.0/'],
];

for (const [given, canonical] of rights) {
  test(`publishes the rights URL ${given} in its canonical http form`, () => {
    assert.equal(parseConfig(`rights = "${given}"`, opts).rights, canonical);
  });
}

test('rejects a rights URL IIIF viewers would not recognise and points to attribution instead', () => {
  assert.throws(
    () => parseConfig('rights = "https://example.org/terms"', opts),
    /rights.*Creative Commons.*RightsStatements\.org.*attribution/s,
  );
});

// Every text can be written once, in the site's language, or as a table with one entry per language.
test('texts can be given in several languages, and a plain one is in the site language', () => {
  const c = parseConfig(
    `
language = "cy"
title = { cy = "Harbwr", en = "Harbour" }
summary = "Golygfa o'r harbwr."

[[metadata]]
label = { cy = "Dyddiad", en = "Date" }
value = "1890"
`,
    opts,
  );
  assert.equal(c.language, 'cy');
  assert.deepEqual(c.title, { cy: 'Harbwr', en: 'Harbour' });
  assert.deepEqual(c.summary, { cy: "Golygfa o'r harbwr." });
  assert.deepEqual(c.metadata, [{ label: { cy: 'Dyddiad', en: 'Date' }, value: { cy: '1890' } }]);
});

test('the image file name becomes the title in the site language', () => {
  assert.deepEqual(parseConfig('language = "de-CH"', opts).title, { 'de-CH': 'harbour-1890' });
});

test('text in no particular language uses the IIIF tag "none"', () => {
  assert.deepEqual(parseConfig('language = "none"\nsummary = "1890"', opts).summary, { none: '1890' });
});

test('alt text describes the image, and falls back to the title', () => {
  assert.deepEqual(parseConfig('title = "Harbour"', opts).alt, { en: 'Harbour' });
  assert.deepEqual(parseConfig('title = "Harbour"\nalt = "Fishing boats at dusk"', opts).alt, { en: 'Fishing boats at dusk' });
});

const languageMistakes = [
  ['language = "English"', /"language" must be a language code such as en, cy or de-CH \(got "English"\)/],
  ['title = { english = "Harbour" }', /"title" has "english", which is not a language code such as en, cy or de-CH/],
  ['title = { en = 3 }', /"title\.en" must be text/],
  ['title = 3', /"title" must be text, or a table of texts by language such as \{ en = "Harbour", cy = "Harbwr" \}/],
  ['summary = {}', /"summary" is an empty table/],
  ['[[metadata]]\nlabel = "Date"', /each \[\[metadata\]\] entry needs a "label" and a "value" \(entry 1\)/],
];

for (const [toml, says] of languageMistakes) {
  test(`explains what is wrong with ${toml.replaceAll('\n', ' ')}`, () => {
    assert.throws(() => parseConfig(toml, opts), says);
  });
}
