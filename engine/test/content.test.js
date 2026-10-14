import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findImage } from '../lib/source.js';
import { readContent } from '../lib/content.js';
import { tempDir } from './support/tmp.js';

/** A content folder holding `files`, each name mapped to what it says. */
async function content(files) {
  const dir = await tempDir('content');
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}
const named = (...names) => content(Object.fromEntries(names.map((name) => [name, 'x'])));

test('finds the single image, with its format, and ignores the settings and descriptions', async () => {
  const dir = await named('whatiiif.toml', 'description.md', 'harbour.TIF', '.gitkeep');
  assert.deepEqual(await findImage(dir), { path: join(dir, 'harbour.TIF'), name: 'harbour.TIF', format: 'image/tiff' });
});

test('explains what to do when there is no image', async () => {
  await assert.rejects(findImage(await named('whatiiif.toml')), /no image.*content\/.*tif, png, jpg/i);
});

test('names every file when there is more than one image', async () => {
  await assert.rejects(findImage(await named('a.png', 'b.jpg')), /exactly one.*a\.png.*b\.jpg/is);
});

test('tells the user to convert unsupported formats', async () => {
  await assert.rejects(findImage(await named('scan.jp2')), /scan\.jp2.*not supported.*convert.*tiff/is);
});

test('with nothing but a picture, the settings are the defaults and the title is the file name', async () => {
  const { image, config, description, languages } = await readContent(await named('Harbour view.jpg'));
  assert.equal(image.format, 'image/jpeg');
  assert.deepEqual(config.title, { en: 'Harbour view' });
  assert.equal(description, undefined);
  assert.deepEqual(languages, ['en']);
});

test('turns description.md into HTML, in the site language', async () => {
  const { description } = await readContent(await content({ 'a.png': 'x', 'description.md': '# About\n\nA *harbour*.' }));
  assert.deepEqual(description, { en: '<h1>About</h1>\n<p>A <em>harbour</em>.</p>\n' });
});

test('lists every language the texts are in, the site language first, with a description for each', async () => {
  const dir = await content({
    'a.png': 'x',
    'whatiiif.toml': 'language = "cy"\ntitle = { en = "Harbour", cy = "Harbwr" }\nsummary = { de = "Hafen" }',
    'description.md': 'Golygfa',
    'description.en.md': 'A view',
    'description.notes.v2.md': 'Not a translation',
  });
  const { config, description, languages } = await readContent(dir);
  assert.deepEqual(languages, ['cy', 'de', 'en']);
  assert.deepEqual(config.alt, { en: 'Harbour', cy: 'Harbwr' });
  assert.deepEqual(description, { cy: '<p>Golygfa</p>\n', en: '<p>A view</p>\n' });
});

test('a mistake in the settings stops the build with what to fix', async () => {
  await assert.rejects(readContent(await content({ 'a.png': 'x', 'whatiiif.toml': 'titel = "Harbour"' })), /unknown setting "titel"/);
});
