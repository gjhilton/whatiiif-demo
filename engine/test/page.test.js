import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cardImage, pageFallback, pageHead, personalisePage } from '../lib/page.js';
import { tempDir } from './support/tmp.js';

const imageId = 'https://gjh.github.io/harbour/iiif/image';
const info = { width: 6000, height: 4000, sizes: [{ width: 375, height: 250 }, { width: 750, height: 500 }, { width: 1500, height: 1000 }] };
const site = {
  language: 'en',
  title: { en: 'Harbour "at" <dusk> & dawn', cy: 'Harbwr' },
  summary: { en: 'The fleet coming in.' },
  alt: { en: 'Fishing boats & a pier' },
  pageUrl: 'https://gjh.github.io/harbour/',
  manifestUrl: 'https://gjh.github.io/harbour/iiif/manifest.json',
  fullUrl: 'https://gjh.github.io/harbour/iiif/image/full/max/0/default.jpg',
  originalUrl: 'https://raw.githubusercontent.com/gjh/harbour/main/content/a.tif',
};

test('a card shows the largest whole-image file up to 1200 pixels wide', () => {
  assert.deepEqual(cardImage({ info, imageId }), { url: `${imageId}/full/750,500/0/default.jpg`, width: 750, height: 500 });
});

test('a card for a tall picture is no more than 1200 pixels tall either', () => {
  const scroll = { width: 1000, height: 40000, sizes: [{ width: 8, height: 313 }, { width: 16, height: 625 }, { width: 32, height: 1250 }] };
  assert.equal(cardImage({ info: scroll, imageId }).height, 625);
});

test('a card shows the smallest size when every size is bigger, rather than the full-size file, which may not be published', () => {
  const bigTiles = { width: 4000, height: 3000, sizes: [{ width: 2000, height: 1500 }] };
  assert.deepEqual(cardImage({ info: bigTiles, imageId }), { url: `${imageId}/full/2000,1500/0/default.jpg`, width: 2000, height: 1500 });
});

test('a card for an image small enough for one tile shows the image itself', () => {
  assert.deepEqual(cardImage({ info: { width: 300, height: 200, sizes: [] }, imageId }), {
    url: `${imageId}/full/max/0/default.jpg`,
    width: 300,
    height: 200,
  });
});

test('the head names the image and gives social sites an absolute picture, all safely escaped', () => {
  const head = pageHead({ site, image: cardImage({ info, imageId }) });
  for (const tag of [
    '<title>Harbour &quot;at&quot; &lt;dusk&gt; &amp; dawn</title>',
    '<meta name="description" content="The fleet coming in.">',
    '<link rel="canonical" href="https://gjh.github.io/harbour/">',
    '<meta property="og:type" content="website">',
    '<meta property="og:url" content="https://gjh.github.io/harbour/">',
    '<meta property="og:title" content="Harbour &quot;at&quot; &lt;dusk&gt; &amp; dawn">',
    '<meta property="og:description" content="The fleet coming in.">',
    `<meta property="og:image" content="${imageId}/full/750,500/0/default.jpg">`,
    '<meta property="og:image:width" content="750">',
    '<meta property="og:image:height" content="500">',
    '<meta property="og:image:alt" content="Fishing boats &amp; a pier">',
    '<meta name="twitter:card" content="summary_large_image">',
  ]) {
    assert.ok(head.includes(tag), tag);
  }
});

test('without a summary the description falls back to the title', () => {
  const head = pageHead({ site: { ...site, summary: undefined }, image: cardImage({ info, imageId }) });
  assert.ok(head.includes('<meta name="description" content="Harbour &quot;at&quot; &lt;dusk&gt; &amp; dawn">'));
  assert.equal(head.includes('og:description'), false);
});

test('the fallback for browsers without JavaScript shows the picture, described, with its links', () => {
  const fallback = pageFallback({ site, image: cardImage({ info, imageId }) });
  assert.match(fallback, /^<noscript>/);
  for (const part of [
    '<h1 lang="en">Harbour &quot;at&quot; &lt;dusk&gt; &amp; dawn</h1>',
    '<p lang="en">The fleet coming in.</p>',
    `<img src="${imageId}/full/750,500/0/default.jpg" width="750" height="500" alt="Fishing boats &amp; a pier" lang="en">`,
    '<a href="https://gjh.github.io/harbour/iiif/manifest.json">IIIF manifest</a>',
    '<a href="https://gjh.github.io/harbour/iiif/image/full/max/0/default.jpg">Full-size JPEG</a>',
    '<a href="https://raw.githubusercontent.com/gjh/harbour/main/content/a.tif">Original file</a>',
  ]) {
    assert.ok(fallback.includes(part), part);
  }
});

const builtPage = `<!doctype html><html lang="en"><head><meta charset="UTF-8" />
<!-- whatiiif:head --><title>whatiiif</title><!-- /whatiiif:head -->
<script type="module" src="./assets/index.js"></script></head>
<body><!-- whatiiif:body --><!-- /whatiiif:body --><div id="root"></div></body></html>`;

test('personalising a built page fills in its marked places, and doing it again replaces rather than repeats', async () => {
  const file = join(await tempDir('page'), 'index.html');
  await writeFile(file, builtPage);
  const parts = { site: { ...site, title: { en: 'Costs $& more' } }, image: cardImage({ info, imageId }) };
  await personalisePage(file, parts);
  await personalisePage(file, parts);

  const html = await readFile(file, 'utf8');
  assert.equal(html.match(/og:title/g).length, 1);
  assert.equal(html.match(/<noscript>/g).length, 1);
  assert.ok(html.includes('<title>Costs $&amp; more</title>'), 'replacement patterns in a title are not interpreted');
  assert.ok(html.includes('<script type="module" src="./assets/index.js"></script>'), 'the rest of the page is untouched');
  assert.equal(html.includes('<title>whatiiif</title>'), false);
});

test('there is nothing to personalise when the page has not been built', async () => {
  assert.equal(await personalisePage(join(await tempDir('page'), 'index.html'), { site, image: cardImage({ info, imageId }) }), false);
});

test('a built page without the marked places is an error worth stopping for', async () => {
  const file = join(await tempDir('page'), 'index.html');
  await writeFile(file, '<html><head></head><body></body></html>');
  await assert.rejects(personalisePage(file, { site, image: cardImage({ info, imageId }) }), /index\.html.*whatiiif:head/);
});
