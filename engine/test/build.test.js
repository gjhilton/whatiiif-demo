import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, copyFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from '../lib/build.js';
import { missingFiles } from '../lib/service.js';
import { makeImage } from './support/fixtures.js';
import { tempDir } from './support/tmp.js';

async function setup(toml = '') {
  const content = await tempDir('content');
  const out = await tempDir('dist');
  await copyFile(await makeImage(2000, 1500), join(content, 'harbour.tif'));
  if (toml) await writeFile(join(content, 'whatiiif.toml'), toml);
  return { content, out };
}
const read = async (p) => JSON.parse(await readFile(p, 'utf8'));

test('builds a valid service, manifest and site config from a committed image', async () => {
  const { content, out } = await setup('title = "Harbour"\nattribution = "Museum"');
  await build({
    contentDir: content,
    outDir: out,
    env: { SITE_BASE_URL: 'https://example.org/site', GITHUB_REPOSITORY: 'gjh/harbour', GITHUB_REF_NAME: 'main' },
  });

  const imageDir = join(out, 'iiif/image');
  assert.deepEqual(await missingFiles(imageDir), []);
  assert.equal((await read(join(imageDir, 'info.json'))).id, 'https://example.org/site/iiif/image');

  const manifest = await read(join(out, 'iiif/manifest.json'));
  assert.equal(manifest.id, 'https://example.org/site/iiif/manifest.json');
  assert.deepEqual(manifest.label, { en: ['Harbour'] });
  assert.deepEqual(manifest.homepage[0].id, 'https://example.org/site/');
  assert.deepEqual(manifest.rendering[0], {
    id: 'https://raw.githubusercontent.com/gjh/harbour/main/content/harbour.tif',
    type: 'Image',
    label: { en: ['Original file'] },
    format: 'image/tiff',
  });

  const site = await read(join(out, 'site.json'));
  assert.equal(site.viewer, 'openseadragon');
  assert.equal(site.manifestUrl, 'https://example.org/site/iiif/manifest.json');
  assert.equal(site.infoUrl, 'https://example.org/site/iiif/image/info.json');
  assert.equal(site.canvasId, manifest.items[0].id);
  assert.deepEqual(site.title, { en: 'Harbour' });
  assert.equal(site.width, 2000);
});

test('base_url in the config overrides the derived Pages URL', async () => {
  const { content, out } = await setup('base_url = "https://iiif.example.com/"');
  await build({ contentDir: content, outDir: out, env: { SITE_BASE_URL: 'https://example.org/site' } });
  assert.equal((await read(join(out, 'iiif/manifest.json'))).id, 'https://iiif.example.com/iiif/manifest.json');
});

test('honours publish.full = false', async () => {
  const { content, out } = await setup('[publish]\nfull = false');
  await build({ contentDir: content, outDir: out, env: {} });
  const body = (await read(join(out, 'iiif/manifest.json'))).items[0].items[0].items[0].body;
  assert.match(body.id, /full\/1000,750\/0\/default\.jpg$/);
});

test('a rebuild after swapping the image leaves no tiles from the previous one', async () => {
  const { content, out } = await setup();
  await build({ contentDir: content, outDir: out, env: {} });
  await rm(join(content, 'harbour.tif'));
  await copyFile(await makeImage(300, 200), join(content, 'postcard.tif'));
  await build({ contentDir: content, outDir: out, env: {} });

  // A 300x200 image is one tile, so all that is published is the whole image, under the name libvips
  // gives it and the one viewers ask for.
  assert.deepEqual(await readdir(join(out, 'iiif/image')), ['full', 'info.json']);
  assert.deepEqual(await readdir(join(out, 'iiif/image/full')), ['300,200', 'max']);
});

test('gives the page its texts in every language, with the description already turned into HTML', async () => {
  const { content, out } = await setup('language = "cy"\ntitle = { en = "Harbour", cy = "Harbwr" }');
  await writeFile(join(content, 'description.md'), 'Golygfa *hyfryd*');
  await build({ contentDir: content, outDir: out, env: {} });

  const site = await read(join(out, 'site.json'));
  assert.equal(site.language, 'cy');
  assert.deepEqual(site.languages, ['cy', 'en']);
  assert.deepEqual(site.title, { en: 'Harbour', cy: 'Harbwr' });
  assert.deepEqual(site.description, { cy: '<p>Golygfa <em>hyfryd</em></p>\n' });
});

test('personalises the built page: a social card showing a published picture, and a fallback without JavaScript', async () => {
  const { content, out } = await setup('title = "Harbour"\nalt = "Fishing boats at dusk"');
  // What Vite leaves in the output folder before the engine runs.
  await writeFile(join(out, 'index.html'), '<head><!-- whatiiif:head --><title>whatiiif</title><!-- /whatiiif:head --></head><body><!-- whatiiif:body --><!-- /whatiiif:body --></body>');
  await build({ contentDir: content, outDir: out, env: { SITE_BASE_URL: 'https://example.org/site' } });

  assert.equal((await read(join(out, 'site.json'))).pageUrl, 'https://example.org/site/');
  const html = await readFile(join(out, 'index.html'), 'utf8');
  const card = html.match(/<meta property="og:image" content="https:\/\/example\.org\/site\/(iiif\/image\/full\/[^"]+)">/);
  assert.ok(card, 'the card picture is an absolute address on the site');
  assert.deepEqual(await readdir(join(out, card[1], '..')), ['default.jpg'], 'and that file is published');
  assert.ok(html.includes('alt="Fishing boats at dusk"'));
});
