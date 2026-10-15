// The preview page's own logic, apart from React and the viewers: what its address asks for and links to, and
// which language it speaks. Node runs these TypeScript files as they are, its types stripped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedCode, linkTo, readAddress, regionLinked, withChoice, withRegion } from '../client/src/address.ts';
import { citation, fileSize, formatName, rightsName, scaleLength } from '../client/src/describe.ts';
import { chooseLanguage, htmlLang, inLanguage } from '../client/src/language.ts';
import { tilesFor } from '../client/src/save.ts';
import { expectedRequests, imageInfo } from '../lib/service.js';

const site = { width: 4000, height: 3000, pageUrl: 'https://gjh.github.io/harbour/', language: 'en', languages: ['en'] };
const welsh = { ...site, language: 'cy', languages: ['cy', 'en', 'pt-BR'] };
const viewers = ['openseadragon', 'mirador'];
const read = (address, on = site) => readAddress(`https://gjh.github.io/harbour/${address}`, on, viewers);

test('an address with nothing in it asks for nothing', () => {
  assert.deepEqual(read(''), { viewer: undefined, language: undefined, region: undefined, embed: false });
});

test('an address asks for a viewer the page offers, a language, the embedded page and a part of the picture', () => {
  assert.deepEqual(read('?embed&viewer=mirador&lang=cy#xywh=100,200,300,400'), {
    viewer: 'mirador',
    language: 'cy',
    region: { x: 100, y: 200, w: 300, h: 400 },
    embed: true,
  });
});

test('an address naming a viewer the page does not offer asks for none', () => {
  assert.equal(read('?viewer=uv').viewer, undefined);
});

const regions = [
  ['#xywh=pixel:100,200,300,400', { x: 100, y: 200, w: 300, h: 400 }, 'in pixels, said so'],
  ['#xywh=3900,2900,500,500', { x: 3900, y: 2900, w: 100, h: 100 }, 'running off the picture, clipped to it'],
  ['#xywh=0,0,4000,3000', undefined, 'the whole picture, which needs no fragment'],
  ['#xywh=2,1,3996,2998', undefined, 'the whole picture but for a sliver at its edges, as a viewer reports it'],
  ['#xywh=30,0,3970,3000', { x: 30, y: 0, w: 3970, h: 3000 }, 'all but a strip someone left out on purpose'],
  ['#xywh=5000,5000,10,10', undefined, 'off the picture altogether'],
  ['#xywh=percent:10,10,20,20', undefined, 'in percent, which links never use'],
  ['#xywh=1,2,3', undefined, 'malformed'],
];

for (const [hash, region, what] of regions) {
  test(`a fragment ${what} (${hash}) asks for ${region ? Object.values(region).join(',') : 'no region'}`, () => {
    assert.deepEqual(read(hash).region, region);
  });
}

test('a choice goes into the address, keeping the rest of it', () => {
  assert.equal(withChoice('https://gjh.github.io/harbour/?lang=cy#xywh=1,2,3,4', 'viewer', 'mirador'), 'https://gjh.github.io/harbour/?lang=cy&viewer=mirador#xywh=1,2,3,4');
});

test('the part of the picture in view goes into the address, and the whole picture takes it out', () => {
  const region = { x: 1, y: 2, w: 3, h: 4 };
  assert.equal(withRegion('https://gjh.github.io/harbour/?viewer=mirador', region), 'https://gjh.github.io/harbour/?viewer=mirador#xywh=1,2,3,4');
  assert.equal(withRegion('https://gjh.github.io/harbour/?viewer=mirador#xywh=1,2,3,4', undefined), 'https://gjh.github.io/harbour/?viewer=mirador');
});

test('a link to the view names the viewer, the language only where there is a choice, and the part in view', () => {
  const region = { x: 1, y: 2, w: 3, h: 4 };
  assert.equal(linkTo(site, { viewer: 'openseadragon', language: 'en' }), 'https://gjh.github.io/harbour/?viewer=openseadragon');
  assert.equal(linkTo(welsh, { viewer: 'mirador', language: 'pt-BR', region }), 'https://gjh.github.io/harbour/?viewer=mirador&lang=pt-BR#xywh=1,2,3,4');
  assert.equal(linkTo(site, { viewer: 'mirador', language: 'en', embed: true }), 'https://gjh.github.io/harbour/?embed&viewer=mirador');
});

// A detail link: someone zooms in, copies the link to that view, and links words in description.md to it.
const details = [
  ['#xywh=10,20,30,40', { x: 10, y: 20, w: 30, h: 40 }, 'a fragment on its own'],
  ['https://gjh.github.io/harbour/?viewer=mirador#xywh=10,20,30,40', { x: 10, y: 20, w: 30, h: 40 }, 'the published page, viewer and all'],
  ['./?lang=cy#xywh=10,20,30,40', { x: 10, y: 20, w: 30, h: 40 }, 'this page by a relative link'],
  ['https://gjh.github.io/harbour/', undefined, 'the page without a fragment'],
  ['https://elsewhere.example/#xywh=1,2,3,4', undefined, 'another site'],
  ['https://gjh.github.io/harbour/about.html#xywh=1,2,3,4', undefined, 'another page on the same site'],
];

for (const [href, region, what] of details) {
  test(`a link in the description to ${what} ${region ? 'shows a detail' : 'is an ordinary link'}`, () => {
    assert.deepEqual(regionLinked(href, site, 'http://localhost:4173/?viewer=openseadragon'), region);
  });
}

test('the embed code is an iframe whose address and title cannot break out of their attributes', () => {
  assert.equal(
    embedCode('https://gjh.github.io/harbour/?embed&viewer=mirador', 'Boats "at" <dusk>', site),
    '<iframe src="https://gjh.github.io/harbour/?embed&amp;viewer=mirador" width="800" height="600" style="border:0;width:100%;max-width:800px;height:auto;aspect-ratio:800/600" allowfullscreen loading="lazy" title="Boats &quot;at&quot; &lt;dusk>"></iframe>',
  );
});

test('the embedded picture takes the shape of the picture, within reason, and narrows to fit a phone', () => {
  const shape = (width, height) => embedCode('x', 't', { ...site, width, height }).match(/width="(\d+)" height="(\d+)"/).slice(1).map(Number);
  assert.deepEqual(shape(1200, 1600), [800, 1067]);
  assert.deepEqual(shape(3000, 1000), [800, 400], 'no wider than two to one');
  assert.deepEqual(shape(1000, 40000), [800, 1067], 'no taller than three to four');
});

const licences = [
  ['http://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0'],
  ['http://creativecommons.org/licenses/by-nc-sa/4.0/', 'CC BY-NC-SA 4.0'],
  ['http://creativecommons.org/licenses/by/3.0/de/', 'CC BY 3.0 DE'],
  ['http://creativecommons.org/publicdomain/zero/1.0/', 'CC0 1.0'],
  ['http://creativecommons.org/publicdomain/mark/1.0/', 'Public Domain Mark 1.0'],
  ['http://rightsstatements.org/vocab/InC/1.0/', 'In Copyright'],
  ['http://rightsstatements.org/vocab/NoC-US/1.0/', 'No Copyright – United States'],
  ['http://rightsstatements.org/vocab/XYZ/1.0/', 'http://rightsstatements.org/vocab/XYZ/1.0/'],
];

for (const [url, name] of licences) {
  test(`the rights ${url} are shown as ${name}`, () => {
    assert.equal(rightsName(url), name);
  });
}

test('downloads are described the way a computer shows files', () => {
  assert.deepEqual([fileSize(900), fileSize(48_000), fileSize(4_120_000), fileSize(123_400_000), fileSize(2_345_000_000)], ['1 KB', '48 KB', '4.1 MB', '123 MB', '2.3 GB']);
  const formats = ['image/tiff', 'image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];
  assert.deepEqual(formats.map(formatName), ['TIFF', 'PNG', 'JPEG', 'WebP', 'AVIF', 'GIF']);
});

const choices = [
  [['cy'], 'cy', 'the language asked for'],
  [['CY'], 'cy', 'the language asked for, whatever its case'],
  [['cy-GB'], 'cy', 'a close relative of the language asked for'],
  [['pt-PT'], 'pt-BR', 'a close relative the other way round'],
  [[undefined, 'fr', 'en-GB'], 'en', 'the first of the browser’s languages the site has'],
  [['fr'], 'cy', 'the site’s own when it has none of them'],
];

for (const [wanted, chosen, what] of choices) {
  test(`speaks ${what}: ${wanted.join(', ')} gives ${chosen}`, () => {
    assert.equal(chooseLanguage(welsh, wanted), chosen);
  });
}

test('a text missing in the language shown is given in the site’s own, else in any it has, marked as such', () => {
  assert.deepEqual(inLanguage({ cy: 'Harbwr', en: 'Harbour' }, 'en', welsh), { text: 'Harbour', lang: 'en' });
  assert.deepEqual(inLanguage({ cy: 'Harbwr' }, 'en', welsh), { text: 'Harbwr', lang: 'cy' });
  assert.deepEqual(inLanguage({ de: 'Hafen' }, 'en', welsh), { text: 'Hafen', lang: 'de' });
  assert.deepEqual(inLanguage({ none: '1890' }, 'en', welsh), { text: '1890', lang: undefined });
});

// A citation names what is cited as a reader of the page sees it: in their language, at the view they are looking at.
const viewed = new Date(2026, 9, 15);
const link = 'https://gjh.github.io/harbour/?viewer=openseadragon#xywh=1,2,3,4';
const cited = { ...welsh, title: { en: 'Harbour at dusk', cy: 'Harbwr' }, metadata: [] };

test('a citation gives who made the picture and when, its title, its credit, the link to the view, and the day it was viewed', () => {
  const site = { ...cited, creator: { en: 'J. M. W. Turner' }, date: { en: 'about 1890' }, attribution: { en: 'Example Museum' } };
  assert.equal(
    citation(site, 'en', link, viewed),
    'J. M. W. Turner (about 1890) Harbour at dusk. Example Museum. Available at: https://gjh.github.io/harbour/?viewer=openseadragon#xywh=1,2,3,4 (Accessed: 15 October 2026).',
  );
});

test('a citation leaves out what the site does not say, and is in the language the visitor reads', () => {
  assert.equal(citation(cited, 'cy', link, viewed), `Harbwr. Available at: ${link} (Accessed: 15 October 2026).`);
  assert.equal(citation({ ...cited, date: { en: '1890' }, attribution: { en: 'Example Museum.' } }, 'en', link, viewed), `Harbour at dusk (1890). Example Museum. Available at: ${link} (Accessed: 15 October 2026).`);
});

// A scale bar of the longest round length (1, 2 or 5, times a power of ten) that is no more than 100 pixels long.
const scales = [
  [0.02, 'cm', { pixels: 100, label: '2 cm' }],
  [0.2, 'mm', { pixels: 100, label: '2 cm' }],
  [0.005, 'mm', { pixels: 100, label: '0.5 mm' }],
  [1, 'cm', { pixels: 100, label: '1 m' }],
  [0.03, 'm', { pixels: 66.66666666666667, label: '2 m' }],
  [0.01, 'in', { pixels: 100, label: '1 in' }],
  [0.15, 'in', { pixels: 66.66666666666667, label: '10 in' }],
];
for (const [perPixel, unit, bar] of scales) {
  test(`at ${perPixel} ${unit} a pixel, the scale bar shows ${bar.label}`, () => {
    assert.deepEqual(scaleLength(perPixel, unit), bar);
  });
}

// Saving a view assembles it from published tiles: only files the build publishes, covering the region exactly.
const pictures = [[4000, 3000, 512], [4999, 3001, 512], [300, 200, 512], [2000, 37, 256], [10000, 8000, 512]];
const parts = (W, H) => [undefined, { x: 0, y: 0, w: W, h: H }, { x: 1, y: 2, w: Math.ceil(W / 3), h: Math.ceil(H / 2) }, { x: W - 7, y: H - 5, w: 7, h: 5 }];

for (const [W, H, tileSize] of pictures) {
  for (const region of parts(W, H)) {
    test(`saving ${region ? Object.values(region).join(',') : 'the whole'} of a ${W}x${H} picture asks only for published files, which cover it`, () => {
      const info = imageInfo({ id: 'https://e.org/iiif/image', width: W, height: H, tileSize });
      const published = new Set(expectedRequests(info));
      const plan = tilesFor(info, region);
      const part = region ?? { x: 0, y: 0, w: W, h: H };
      assert.ok(Math.max(plan.width, plan.height) <= 4096, `${plan.width}x${plan.height} is no bigger than 4096 on a side`);
      assert.deepEqual([plan.width, plan.height], [Math.ceil(part.w / plan.scale), Math.ceil(part.h / plan.scale)]);
      for (const { path } of plan.tiles) assert.ok(published.has(path), `${path} is published`);
      // Every pixel of the saved picture comes from some tile.
      const covered = (px, py) => plan.tiles.some(({ x, y, w, h }) => px >= x && px < x + w && py >= y && py < y + h);
      for (const [px, py] of [[0, 0], [plan.width - 1, 0], [0, plan.height - 1], [plan.width - 1, plan.height - 1], [Math.floor(plan.width / 2), Math.floor(plan.height / 2)]]) {
        assert.ok(covered(px, py), `pixel ${px},${py} is covered`);
      }
    });
  }
}

test('saving a view uses full-resolution tiles when they fit, and a lower level when they would not', () => {
  const info = imageInfo({ id: 'x', width: 10000, height: 8000, tileSize: 512 });
  assert.equal(tilesFor(info, { x: 0, y: 0, w: 3000, h: 2000 }).scale, 1);
  assert.equal(tilesFor(info, { x: 0, y: 0, w: 5000, h: 2000 }).scale, 2);
  assert.equal(tilesFor(info).scale, 4);
});

test('a tile is placed where its part of the picture falls in the saved one', () => {
  const info = imageInfo({ id: 'x', width: 4000, height: 3000, tileSize: 512 });
  const { tiles } = tilesFor(info, { x: 600, y: 520, w: 100, h: 100 });
  assert.deepEqual(tiles, [{ path: '512,512,512,512/512,512/0/default.jpg', x: -88, y: -8, w: 512, h: 512 }]);
});

test('text in no particular language is not marked as in a language called "none"', () => {
  assert.deepEqual(['cy', 'pt-BR', 'none'].map(htmlLang), ['cy', 'pt-BR', undefined]);
});
