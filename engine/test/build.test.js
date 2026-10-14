import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, copyFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from '../lib/build.js';
import { missingFiles } from '../lib/service.js';
import sharp from 'sharp';
import { makeImage } from './support/fixtures.js';
import { run, repo } from './support/harness.js';
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
  await writeFile(join(out, 'index.html'), '<head><!-- whatiiif:head --><title>whatiiif</title><!-- /whatiiif:head --></head><body><!-- whatiiif:body --><!-- /whatiiif:body --></body>'); // as Vite leaves it
  await build({ contentDir: content, outDir: out, env: { SITE_BASE_URL: 'https://example.org/site' } });

  assert.equal((await read(join(out, 'site.json'))).pageUrl, 'https://example.org/site/');
  const html = await readFile(join(out, 'index.html'), 'utf8');
  const card = html.match(/<meta property="og:image" content="https:\/\/example\.org\/site\/(iiif\/image\/full\/[^"]+)">/);
  assert.ok(card, 'the card picture is an absolute address on the site');
  assert.deepEqual(await readdir(join(out, card[1], '..')), ['default.jpg'], 'and that file is published');
  assert.ok(html.includes('alt="Fishing boats at dusk"'));
});

// What Vite leaves in the output folder before the engine runs.
const builtPage = '<head><!-- whatiiif:head --><title>whatiiif</title><!-- /whatiiif:head --></head><body><!-- whatiiif:body --><!-- /whatiiif:body --></body>';
const github = { SITE_BASE_URL: 'https://gjh.github.io/harbour', GITHUB_REPOSITORY: 'gjh/harbour', GITHUB_REF_NAME: 'main' };

test('a picture given by its link is published, and the link is where its original is downloaded from', async () => {
  const content = await tempDir('content');
  const out = await tempDir('dist');
  const link = 'https://github.com/gjh/harbour/releases/download/picture/Harbour%20scan.tif';
  const picture = await readFile(await makeImage(900, 600));
  await writeFile(join(content, 'whatiiif.toml'), `picture = "${link}"`);
  const fetch = async (url) => (url === link ? new Response(picture) : new Response('', { status: 404 }));

  await build({ contentDir: content, outDir: out, env: github, fetch });
  const manifest = await read(join(out, 'iiif/manifest.json'));
  assert.deepEqual(manifest.label, { en: ['Harbour scan'] });
  assert.equal(manifest.rendering[0].id, link);
  assert.deepEqual(await missingFiles(join(out, 'iiif/image')), []);
  const site = await read(join(out, 'site.json'));
  assert.deepEqual([site.originalUrl, site.originalBytes, site.originalFormat], [link, picture.length, 'image/tiff']);
});

test('site.json says how big each download is', async () => {
  const { content, out } = await setup();
  await build({ contentDir: content, outDir: out, env: github });
  const site = await read(join(out, 'site.json'));
  assert.equal(site.fullBytes, (await readFile(join(out, 'iiif/image/full/max/0/default.jpg'))).length);
  assert.equal(site.originalBytes, (await readFile(join(content, 'harbour.tif'))).length);
  assert.equal(site.originalFormat, 'image/tiff');
});

test('publish.original = false leaves the original unlinked', async () => {
  const { content, out } = await setup('[publish]\noriginal = false');
  await build({ contentDir: content, outDir: out, env: github });
  assert.equal('rendering' in (await read(join(out, 'iiif/manifest.json'))), false);
  assert.equal((await read(join(out, 'site.json'))).originalUrl, undefined);
});

test('a private repository does not link its original, which visitors could not download', async () => {
  const { content, out } = await setup();
  const event = join(await tempDir('github'), 'event.json');
  await writeFile(event, JSON.stringify({ repository: { full_name: 'gjh/harbour', visibility: 'private', private: true } }));
  await build({ contentDir: content, outDir: out, env: { ...github, GITHUB_EVENT_PATH: event } });
  assert.equal('rendering' in (await read(join(out, 'iiif/manifest.json'))), false);
});

test('files in content/ that are not used are pointed out, and do not stop the build', async () => {
  const { content, out } = await setup();
  await writeFile(join(content, 'descripton.md'), 'A view');
  const warnings = [];
  await build({ contentDir: content, outDir: out, env: {}, warn: (message) => warnings.push(message) });
  assert.deepEqual(warnings, ['content/descripton.md is not used; did you mean description.md?']);
});

test('the built page carries the site\'s details, so it opens without asking for them, and an icon cut from the picture', async () => {
  const { content, out } = await setup('title = "Harbour"');
  await writeFile(join(out, 'index.html'), builtPage);
  await build({ contentDir: content, outDir: out, env: github });

  const html = await readFile(join(out, 'index.html'), 'utf8');
  const data = html.match(/<script type="application\/json" id="whatiiif-site">(.*?)<\/script>/s);
  assert.deepEqual(JSON.parse(data[1]), await read(join(out, 'site.json')));
  assert.ok(html.includes('<link rel="icon" href="icon.png">'));
  const { width, height, format } = await sharp(join(out, 'icon.png')).metadata();
  assert.deepEqual({ width, height, format }, { width: 180, height: 180, format: 'png' });
});

test('colours chosen in whatiiif.toml are written into the page, where they outrank the defaults', async () => {
  const { content, out } = await setup('[colours]\npaper = "#fdf6e3"\nink = "rgb(20 20 20)"');
  await writeFile(join(out, 'index.html'), builtPage);
  await build({ contentDir: content, outDir: out, env: github });
  assert.ok((await readFile(join(out, 'index.html'), 'utf8')).includes('<style>html:root { --paper: #fdf6e3; --ink: rgb(20 20 20); }</style>'));
});

// engine/build.js as the Deploy workflow runs it. GitHub shows annotations at the top of a run's page and the step
// summary below them, so whoever made a mistake reads what to do without opening any log.
async function buildInActions(content, out) {
  const summary = join(await tempDir('github'), 'summary.md');
  await writeFile(summary, '');
  const env = { ...github, GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summary };
  const result = await run('node', [join(repo, 'engine/build.js'), '--content', content, '--out', out], { env });
  return { ...result, summary: await readFile(summary, 'utf8') };
}

test('in a workflow run, a mistake is shown on the run\'s page as an error, saying what to fix', async () => {
  const { content, out } = await setup('titel = "Harbour"\n\n[[metadata]]\nlabel = "Date"');
  const { code, stdout, summary } = await buildInActions(content, out);
  assert.equal(code, 1);
  assert.match(stdout, /^::error title=Your site was not built::content\/whatiiif\.toml: unknown setting "titel"; did you mean "title"\? Valid settings here: .*$/m);
  assert.match(summary, /## Your site was not built\n\ncontent\/whatiiif\.toml: unknown setting "titel"/);
});

test('in a workflow run, anything worth a look is a warning, and the summary says where the site will be', async () => {
  const { content, out } = await setup('title = "Harbour"');
  await writeFile(join(content, 'descripton.md'), 'A view');
  const { code, stdout, summary } = await buildInActions(content, out);
  assert.equal(code, 0);
  assert.match(stdout, /^::warning title=Worth a look::content\/descripton\.md is not used; did you mean description\.md\?$/m);
  assert.match(summary, /\*\*https:\/\/gjh\.github\.io\/harbour\/\*\*/);
  assert.match(summary, /\| Picture \| harbour\.tif, 2,000 × 1,500 pixels \|/);
  assert.match(summary, /\| IIIF manifest \| https:\/\/gjh\.github\.io\/harbour\/iiif\/manifest\.json \|/);
  assert.match(summary, /!\[Harbour\]\(https:\/\/gjh\.github\.io\/harbour\/iiif\/image\/full\/[^)]+\)/);
  assert.match(summary, /- content\/descripton\.md is not used/);
});

test('in a workflow run, a message over several lines stays one annotation', async () => {
  const { stdout } = await buildInActions(await tempDir('content'), await tempDir('dist'));
  assert.match(stdout, /^::error title=Your site was not built::No image found in content\/\. .*$/m);
  const { escapeAnnotation } = await import('../lib/report.js');
  assert.equal(escapeAnnotation('50% done\nthen\r more'), '50%25 done%0Athen%0D more');
});
