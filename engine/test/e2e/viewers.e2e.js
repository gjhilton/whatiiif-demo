// Both viewers against awkwardly shaped images, in a real browser (Chromium, via Playwright): each must
// be able to zoom to full resolution using only the files that were published.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { build } from '../../lib/build.js';
import { makeImage } from '../fixtures.js';
import { tempDir } from '../tmp.js';
import { browse, buildPage, zoomToFullResolution } from './harness.js';

// A project-pages style address, with the site in a sub-folder.
const SITE = 'https://whatiiif.example/my-image';
// The shape that first showed a viewer asking for tiles that were never cut, then the slicer's awkward cases.
const SHAPES = [[3000, 2000], [4999, 3001], [1024, 1024], [513, 513], [300, 200], [2000, 37], [1, 1]];
// Each viewer's name and the element it draws into.
const VIEWERS = {
  openseadragon: { label: 'OpenSeadragon', surface: '.openseadragon-container' },
  mirador: { label: 'Mirador', surface: '.mirador-window' },
};

const built = new Map(); // "3000x2000" -> what the build wrote for that image (iiif/ and site.json)
let pageDir;
let browser;

before(async () => {
  for (const [width, height] of SHAPES) {
    const content = await tempDir('content');
    const out = await tempDir('built');
    await copyFile(await makeImage(width, height), join(content, 'smoke.tif'));
    await build({ contentDir: content, outDir: out, env: { SITE_BASE_URL: SITE } });
    built.set(`${width}x${height}`, out);
  }
  pageDir = await buildPage();
  browser = await chromium.launch();
});

after(() => browser?.close());

const open = (viewer, shape) =>
  browse(browser, {
    siteUrl: SITE,
    query: `?viewer=${viewer}`,
    fileFor: (path) => join(path === 'site.json' || path.startsWith('iiif/') ? built.get(shape) : pageDir, path),
  });

for (const [width, height] of SHAPES) {
  for (const [viewer, { label }] of Object.entries(VIEWERS)) {
    test(`${label} shows a ${width}x${height} image down to full resolution from the published files alone`, async () => {
      const site = await open(viewer, `${width}x${height}`);
      await zoomToFullResolution(site);
      assert.deepEqual(site.problems, []);
      await site.close();
    });
  }
}

// Guards against page styles leaking into a viewer's own markup and squeezing it.
for (const [viewer, { label, surface }] of Object.entries(VIEWERS)) {
  test(`${label} fills the viewer pane`, async () => {
    const site = await open(viewer, '3000x2000');
    const drawn = await site.page.locator(surface).first().boundingBox();
    assert.deepEqual(drawn, await site.page.locator('.viewer').boundingBox());
    await site.close();
  });
}
