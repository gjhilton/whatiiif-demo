// The preview page's own logic, apart from React and the viewers: what its address asks for and links to, and
// which language it speaks. Node runs these TypeScript files as they are, its types stripped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedCode, linkTo, readAddress, withChoice, withRegion } from '../client/src/address.ts';
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

test('the embed code is an iframe whose address and title cannot break out of their attributes', () => {
  assert.equal(
    embedCode('https://gjh.github.io/harbour/?embed&viewer=mirador', 'Boats "at" <dusk>'),
    '<iframe src="https://gjh.github.io/harbour/?embed&amp;viewer=mirador" width="800" height="600" style="border:0" allowfullscreen loading="lazy" title="Boats &quot;at&quot; &lt;dusk>"></iframe>',
  );
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
