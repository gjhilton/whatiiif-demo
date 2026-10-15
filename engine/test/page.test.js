import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { wholeImage, pageBody, pageHead, personalisePage } from '../lib/page.js';
import { tempDir } from './support/tmp.js';

const imageId = 'https://gjh.github.io/harbour/iiif/image';
const info = { width: 6000, height: 4000, sizes: [{ width: 375, height: 250 }, { width: 750, height: 500 }, { width: 1500, height: 1000 }] };
const card = { url: 'https://gjh.github.io/harbour/card.jpg', width: 1200, height: 630 };
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

test('the whole picture is shown by the largest whole-image file up to 1200 pixels wide', () => {
  assert.deepEqual(wholeImage({ info, imageId }), { path: 'full/750,500/0/default.jpg', url: `${imageId}/full/750,500/0/default.jpg`, width: 750, height: 500 });
});

test('a tall picture\'s is no more than 1200 pixels tall either', () => {
  const scroll = { width: 1000, height: 40000, sizes: [{ width: 8, height: 313 }, { width: 16, height: 625 }, { width: 32, height: 1250 }] };
  assert.equal(wholeImage({ info: scroll, imageId }).height, 625);
});

test('the smallest size stands in when every size is bigger, rather than the full-size file, which may not be published', () => {
  const bigTiles = { width: 4000, height: 3000, sizes: [{ width: 2000, height: 1500 }] };
  assert.deepEqual(wholeImage({ info: bigTiles, imageId }), { path: 'full/2000,1500/0/default.jpg', url: `${imageId}/full/2000,1500/0/default.jpg`, width: 2000, height: 1500 });
});

test('an image small enough for one tile is shown by the image itself', () => {
  assert.deepEqual(wholeImage({ info: { width: 300, height: 200, sizes: [] }, imageId }), {
    path: 'full/max/0/default.jpg',
    url: `${imageId}/full/max/0/default.jpg`,
    width: 300,
    height: 200,
  });
});

test('the head names the image and gives social sites an absolute picture, all safely escaped', () => {
  const head = pageHead({ site, image: wholeImage({ info, imageId }), card });
  for (const tag of [
    '<title>Harbour &quot;at&quot; &lt;dusk&gt; &amp; dawn</title>',
    '<meta name="description" content="The fleet coming in.">',
    '<link rel="canonical" href="https://gjh.github.io/harbour/">',
    '<meta property="og:type" content="website">',
    '<meta property="og:url" content="https://gjh.github.io/harbour/">',
    '<meta property="og:title" content="Harbour &quot;at&quot; &lt;dusk&gt; &amp; dawn">',
    '<meta property="og:description" content="The fleet coming in.">',
    '<meta property="og:image" content="https://gjh.github.io/harbour/card.jpg">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="Fishing boats &amp; a pier">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<link rel="icon" href="icon.png">',
    '<link rel="apple-touch-icon" href="icon.png">',
  ]) {
    assert.ok(head.includes(tag), tag);
  }
});

test('without a summary the description falls back to the title', () => {
  const head = pageHead({ site: { ...site, summary: undefined }, image: wholeImage({ info, imageId }), card });
  assert.ok(head.includes('<meta name="description" content="Harbour &quot;at&quot; &lt;dusk&gt; &amp; dawn">'));
  assert.equal(head.includes('og:description'), false);
});

test('the head sets no colours of its own unless some are chosen', () => {
  assert.equal(pageHead({ site, image: wholeImage({ info, imageId }), card }).includes('<style>'), false);
  const head = pageHead({ site: { ...site, colours: { paper: '#000', viewer: 'black' } }, image: wholeImage({ info, imageId }), card });
  assert.ok(head.includes('<style>html:root { --paper: #000; --viewer: black; }</style>'));
});

test('the fallback for browsers without JavaScript shows the picture, described, with its links', () => {
  const fallback = pageBody({ site, image: wholeImage({ info, imageId }) });
  assert.match(fallback, /^<noscript>/);
  for (const part of [
    '<h1 lang="en">Harbour &quot;at&quot; &lt;dusk&gt; &amp; dawn</h1>',
    '<p lang="en">The fleet coming in.</p>',
    `<img src="${imageId}/full/750,500/0/default.jpg" width="750" height="500" alt="Fishing boats &amp; a pier" lang="en">`,
    '<a href="https://gjh.github.io/harbour/iiif/manifest.json">IIIF manifest</a>',
    '<a href="https://gjh.github.io/harbour/iiif/image/full/max/0/default.jpg">Full-size JPEG</a>',
    // Not for crawlers: downloads of a picture in Git LFS count against its owner's monthly allowance.
    '<a href="https://raw.githubusercontent.com/gjh/harbour/main/content/a.tif" rel="nofollow">Original file</a>',
  ]) {
    assert.ok(fallback.includes(part), part);
  }
});

test('the page carries the site\'s details as data that no text in them can break out of', () => {
  const body = pageBody({ site: { ...site, summary: { en: '</script><script>alert(1)</script>' } }, image: wholeImage({ info, imageId }) });
  const data = body.match(/<script type="application\/json" id="whatiiif-site">(.*?)<\/script>/s)[1];
  assert.equal(data.includes('</script>'), false);
  assert.deepEqual(JSON.parse(data).summary, { en: '</script><script>alert(1)</script>' });
});

const builtPage = `<!doctype html><html lang="en"><head><meta charset="UTF-8" />
<!-- whatiiif:head --><title>WhatIIIF</title><!-- /whatiiif:head -->
<script type="module" src="./assets/index.js"></script></head>
<body><!-- whatiiif:body --><!-- /whatiiif:body --><div id="root"></div></body></html>`;

test('personalising a built page fills in its marked places, and doing it again replaces rather than repeats', async () => {
  const file = join(await tempDir('page'), 'index.html');
  await writeFile(file, builtPage);
  const parts = { site: { ...site, title: { en: 'Costs $& more' } }, image: wholeImage({ info, imageId }), card };
  await personalisePage(file, parts);
  await personalisePage(file, parts);

  const html = await readFile(file, 'utf8');
  assert.equal(html.match(/og:title/g).length, 1);
  assert.equal(html.match(/<noscript>/g).length, 1);
  assert.ok(html.includes('<title>Costs $&amp; more</title>'), 'replacement patterns in a title are not interpreted');
  assert.ok(html.includes('<script type="module" src="./assets/index.js"></script>'), 'the rest of the page is untouched');
  assert.equal(html.includes('<title>WhatIIIF</title>'), false);
});

test('there is nothing to personalise when the page has not been built', async () => {
  assert.equal(await personalisePage(join(await tempDir('page'), 'index.html'), { site, image: wholeImage({ info, imageId }), card }), false);
});

test('a built page without the marked places is an error worth stopping for', async () => {
  const file = join(await tempDir('page'), 'index.html');
  await writeFile(file, '<html><head></head><body></body></html>');
  await assert.rejects(personalisePage(file, { site, image: wholeImage({ info, imageId }), card }), /index\.html.*whatiiif:head/);
});

test('search engines are told what the picture is, who made it, who to credit and under what licence', () => {
  const described = {
    ...site,
    creator: { en: 'J. M. W. Turner' },
    date: { en: '1890' },
    attribution: { en: 'Example Museum' },
    rights: 'http://creativecommons.org/licenses/by/4.0/',
  };
  const head = pageHead({ site: described, image: wholeImage({ info, imageId }), card });
  const data = JSON.parse(head.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.deepEqual(data, {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    name: 'Harbour "at" <dusk> & dawn',
    description: 'The fleet coming in.',
    url: 'https://gjh.github.io/harbour/',
    contentUrl: 'https://gjh.github.io/harbour/iiif/image/full/max/0/default.jpg',
    thumbnailUrl: 'https://gjh.github.io/harbour/card.jpg',
    creator: { '@type': 'Person', name: 'J. M. W. Turner' },
    dateCreated: '1890',
    creditText: 'Example Museum',
    license: 'http://creativecommons.org/licenses/by/4.0/',
  });
  assert.equal(head.includes('<dusk>'), false, 'nothing in it can close the script element');
});

test('a date that is not a calendar date is left out of what search engines are told, rather than told wrongly', () => {
  const head = pageHead({ site: { ...site, date: { en: 'about 1890' } }, image: wholeImage({ info, imageId }), card });
  assert.equal(head.includes('dateCreated'), false);
});
