// The preview page's own logic, apart from React and the viewers: what its address asks for and links to, and
// which language it speaks. Node runs these TypeScript files as they are, its types stripped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedCode, linkTo, readAddress, regionLinked, withChoice, withRegion } from '../client/src/address.ts';
import { fileSize, formatName, rightsName } from '../client/src/describe.ts';
import { chooseLanguage, inLanguage } from '../client/src/language.ts';

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
  assert.deepEqual([formatName('image/tiff'), formatName('image/png'), formatName('image/jpeg')], ['TIFF', 'PNG', 'JPEG']);
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
