// Checks a site that is already built or already live, as a visitor's browser would find it:
//
//   E2E_SITE_URL=https://you.github.io/your-image node --test engine/test/e2e/check-site.js
//
// E2E_SITE_URL is the address the site was built for. Add E2E_DIST=dist to have every request answered
// from that folder instead of the network, for a site that is built but not yet deployed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expectedRequests } from '../../lib/service.js';
import { schemaProblems, schemaUnavailable } from '../support/schema.js';
import { browse, zoomToFullResolution } from '../support/harness.js';

const siteUrl = process.env.E2E_SITE_URL?.replace(/\/+$/, '');
const dist = process.env.E2E_DIST;
if (!siteUrl) throw new Error('Set E2E_SITE_URL to the address of the site to check.');

const fileFor = dist && ((path) => join(dist, path));
const json = async (path) => JSON.parse(dist ? await readFile(join(dist, path), 'utf8') : await (await fetch(`${siteUrl}/${path}`)).text());

/**
 * Whether a file is published. Over the network a connection now and then times out among the thousand or so
 * requests a big picture needs, so a request that fails without an answer is tried again; a 404 is an answer.
 */
async function published(path) {
  if (dist) return readFile(join(dist, path)).then(() => true, () => false);
  for (let attempt = 1; ; attempt++) {
    try {
      return (await fetch(`${siteUrl}/${path}`, { method: 'HEAD' })).ok;
    } catch (error) {
      if (attempt === 3) throw new Error(`${path} could not be reached: ${error.cause?.code ?? error.message}`);
    }
  }
}

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(() => browser?.close());

test('the page opens and is titled after the image', async () => {
  const titles = Object.values((await json('site.json')).title); // in whichever of its languages the browser gets
  const { page, problems, close } = await browse(browser, { siteUrl, fileFor });
  await page.locator('h1').waitFor();
  assert.ok(titles.includes(await page.locator('h1').textContent()), `the heading is one of ${titles}`);
  assert.equal(await page.title(), await page.locator('h1').textContent());
  assert.deepEqual(problems, []);
  await close();
});

for (const [viewer, label] of [['openseadragon', 'OpenSeadragon'], ['mirador', 'Mirador']]) {
  test(`${label} zooms to full resolution without asking for anything that is not there`, async () => {
    const site = await browse(browser, { siteUrl, fileFor, query: `?viewer=${viewer}` });
    await zoomToFullResolution(site);
    assert.deepEqual(site.problems, []);
    await site.close();
  });
}

test('a shared link shows a picture that is published', async () => {
  const html = dist ? await readFile(join(dist, 'index.html'), 'utf8') : await (await fetch(`${siteUrl}/`)).text();
  const picture = html.match(/<meta property="og:image" content="([^"]+)">/)?.[1];
  assert.ok(picture?.startsWith(`${siteUrl}/`), `og:image is ${picture}`);
  assert.equal(await published(picture.slice(siteUrl.length + 1)), true);
});

test('without JavaScript the page shows the picture, with alt text', async () => {
  const { page, problems, close } = await browse(browser, { siteUrl, fileFor, javaScriptEnabled: false });
  const picture = page.locator('.fallback img');
  await picture.waitFor();
  await page.waitForLoadState('networkidle');
  assert.ok((await picture.getAttribute('alt'))?.trim(), 'the picture is described');
  assert.equal(await picture.evaluate((img) => img.complete && img.naturalWidth > 0), true, 'the picture loads');
  assert.deepEqual(problems, []);
  await close();
});

test('the embedded view shows the picture and its credit, and nothing else', async () => {
  const { page, fetched, problems, close } = await browse(browser, { siteUrl, fileFor, query: '?embed' });
  await page.locator('.credit').waitFor();
  assert.equal(await page.locator('.masthead').count(), 0);
  await zoomToFullResolution({ page, fetched }, { holding: 'Control' });
  assert.deepEqual(problems, []);
  await close();
});

test('the image service is where it says it is, with every file a viewer could ask for', async () => {
  const info = await json('iiif/image/info.json');
  assert.equal(info.id, `${siteUrl}/iiif/image`);
  const missing = [];
  for (const path of expectedRequests(info)) {
    if (!(await published(`iiif/image/${path}`))) missing.push(path);
  }
  assert.deepEqual(missing, []);
});

test('the manifest is where it says it is and paints that image service', async () => {
  const manifest = await json('iiif/manifest.json');
  assert.equal(manifest.id, `${siteUrl}/iiif/manifest.json`);
  assert.equal(manifest.items[0].items[0].items[0].body.service[0].id, `${siteUrl}/iiif/image`);
});

test('the manifest is valid IIIF Presentation 3.0', { skip: schemaUnavailable }, async () => {
  assert.deepEqual(schemaProblems(await json('iiif/manifest.json')), []);
});
