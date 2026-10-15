import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
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

test('finds the single image, with its format and size, and ignores the settings and descriptions', async () => {
  const dir = await named('whatiiif.toml', 'description.md', 'harbour.TIF', '.gitkeep');
  assert.deepEqual(await findImage(dir), { path: join(dir, 'harbour.TIF'), name: 'harbour.TIF', format: 'image/tiff', bytes: 1 });
});

test('explains what to do when there is no image', async () => {
  await assert.rejects(findImage(await named('whatiiif.toml')), /no image.*content\/.*TIFF, PNG, JPEG, WebP, AVIF or GIF/i);
});

test('names every file when there is more than one image', async () => {
  await assert.rejects(findImage(await named('a.png', 'b.jpg')), /exactly one.*a\.png.*b\.jpg/is);
});

test('tells the user to convert unsupported formats', async () => {
  await assert.rejects(findImage(await named('scan.jp2')), /scan\.jp2.*not supported.*convert.*tiff/is);
});

test('names the files people commit that the build cannot read: camera raw, JPEG XL, PDF and SVG', async () => {
  for (const name of ['IMG_0042.DNG', 'IMG_0042.CR3', 'DSC_0042.NEF', 'photo.jxl', 'scan.pdf', 'plan.svg']) {
    await assert.rejects(findImage(await named(name)), new RegExp(`${name.replace('.', '\\.')} is not supported yet\\. Convert it to TIFF, PNG or JPEG`), name);
  }
});

test('accepts the formats the web uses: WebP, AVIF and GIF', async () => {
  for (const [name, format] of [['view.webp', 'image/webp'], ['view.AVIF', 'image/avif'], ['view.gif', 'image/gif']]) {
    assert.equal((await findImage(await named(name))).format, format, name);
  }
});

test('an iPhone photo (HEIC) gets its own explanation of how to make it a JPEG', async () => {
  await assert.rejects(
    findImage(await named('IMG_0001.HEIC')),
    /IMG_0001\.HEIC is an iPhone photo \(HEIC\), which cannot be read here\. Make it a JPEG first: on a Mac, open it in Preview and choose File → Export, then JPEG\./,
  );
});

test('with nothing but a picture, the settings are the defaults, and the title and alt text are the file name', async () => {
  const { image, config, description, languages, unused } = await readContent(await named('Harbour view.jpg', '.gitkeep', '.DS_Store'));
  assert.equal(image.format, 'image/jpeg');
  assert.deepEqual(config.title, { en: 'Harbour view' });
  assert.deepEqual(config.alt, { en: 'Harbour view' });
  assert.equal(description, undefined);
  assert.deepEqual(languages, ['en']);
  assert.deepEqual(unused, []);
});

test('the file name becomes the title in the site language', async () => {
  const { config } = await readContent(await content({ 'harbour-1890.tif': 'x', 'whatiiif.toml': 'language = "de-CH"' }));
  assert.deepEqual(config.title, { 'de-CH': 'harbour-1890' });
});

test('alt text falls back to the title', async () => {
  const { config } = await readContent(await content({ 'a.tif': 'x', 'whatiiif.toml': 'title = "Harbour"' }));
  assert.deepEqual(config.alt, { en: 'Harbour' });
});

test('turns description.md into HTML, in the site language, its headings below the page\'s own title', async () => {
  const { description } = await readContent(await content({ 'a.png': 'x', 'description.md': '# About\n\nA *harbour*.\n\n###### Small print' }));
  assert.deepEqual(description, { en: '<h2>About</h2>\n<p>A <em>harbour</em>.</p>\n<h6>Small print</h6>\n' });
});

test('two descriptions in the same language are a mistake to stop for', async () => {
  const dir = await content({ 'a.png': 'x', 'description.md': 'One', 'description.EN.md': 'Two' });
  await assert.rejects(readContent(dir), /content\/description\.EN\.md and content\/description\.md are both in en; keep one/);
});

test('files in content/ that the site will not use are pointed out, with the name probably meant', async () => {
  const dir = await content({
    'harbour.jpg': 'x',
    'old.heic': 'x',
    'descripton.md': 'x',
    'description.welsh.md': 'x',
    'Whatiiif.toml.txt': 'x',
    'notes.txt': 'x',
  });
  assert.deepEqual((await readContent(dir)).unused, [
    'content/Whatiiif.toml.txt is not used; did you mean whatiiif.toml?',
    'content/description.welsh.md is not used: "welsh" is not a language code such as en, cy or de-CH.',
    'content/descripton.md is not used; did you mean description.md?',
    'content/notes.txt is not used. content/ holds one picture, whatiiif.toml, description.md and notes.md.',
    'content/old.heic is not published: only harbour.jpg is.',
  ]);
});

// A picture too big for the browser can be put somewhere else, such as a GitHub release, and named by its link.
const releaseLink = 'https://github.com/gjh/harbour/releases/download/picture/Harbour%20scan.tif';

/** A stand-in for the web that answers `link` with `body` (or `status`) and records what it was asked for. */
function web({ link = releaseLink, body, status = 200, headers }) {
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    return url === link ? new Response(body, { status, headers }) : new Response('Not Found', { status: 404, statusText: 'Not Found' });
  };
  return { fetch, asked };
}

const linked = (link = releaseLink) => content({ 'whatiiif.toml': `picture = "${link}"` });

test('a picture given by its link is downloaded and named after its file', async () => {
  const picture = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#808080' } }).tiff().toBuffer();
  const { fetch, asked } = web({ body: picture });
  const { image, config } = await readContent(await linked(), { fetch, downloads: await tempDir('downloads') });
  assert.deepEqual(asked, [releaseLink]);
  assert.deepEqual({ ...image, path: undefined }, { path: undefined, name: 'Harbour scan.tif', format: 'image/tiff', bytes: picture.length, url: releaseLink });
  assert.deepEqual(await readFile(image.path), picture);
  assert.deepEqual(config.title, { en: 'Harbour scan' });
});

test('a WebP picture given by its link is read as one', async () => {
  const webp = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#808080' } }).webp().toBuffer();
  const { image } = await readContent(await linked(), { fetch: web({ body: webp }).fetch, downloads: await tempDir('downloads') });
  assert.equal(image.format, 'image/webp');
});

test('a picture given by its link is told apart by what it holds, not what it is called', async () => {
  const png = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#808080' } }).png().toBuffer();
  const link = 'https://example.org/download?id=42';
  const { image } = await readContent(await linked(link), { fetch: web({ link, body: png }).fetch, downloads: await tempDir('downloads') });
  assert.equal(image.format, 'image/png');
  assert.equal(image.name, 'download');
});

test('a picture given by its link is named as the server names it, where it does', async () => {
  const png = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#808080' } }).png().toBuffer();
  const link = 'https://example.org/download?id=42';
  for (const [disposition, name] of [
    ['attachment; filename="Harbour scan.png"', 'Harbour scan.png'],
    ["attachment; filename=harbour.png; filename*=UTF-8''Harbwr%20%C3%A2.png", 'Harbwr â.png'],
    ['inline', 'download'],
  ]) {
    const answer = web({ link, body: png, headers: { 'content-disposition': disposition } });
    const { image } = await readContent(await linked(link), { fetch: answer.fetch, downloads: await tempDir('downloads') });
    assert.equal(image.name, name, disposition);
  }
});

const badLinks = [
  ['a link that leads nowhere', { status: 404 }, /Could not download the picture at https:\/\/github\.com\/gjh\/harbour\/releases\/download\/picture\/Harbour%20scan\.tif: the server answered 404\. Check that the link is right and that anyone can open it/],
  ['a link to a web page about the picture', { body: '\n<!DOCTYPE html><html>' }, /is a web page, not a picture\. Use a link that downloads the picture itself/],
  ['a picture in a format that cannot be read yet', { body: Buffer.from('\0\0\0\x18ftypheic\0\0\0\0') }, /The picture at .* is an iPhone photo \(HEIC\), which cannot be read here\. Make it a JPEG first/],
  ['a JPEG 2000 file', { body: Buffer.from([0, 0, 0, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a]) }, /The picture at .* is a JPEG 2000 file, which is not supported yet\. Convert it to TIFF, PNG or JPEG/],
  ['something that is not a picture at all', { body: 'PK\x03\x04' }, /The picture at .* is not a TIFF, PNG, JPEG, WebP, AVIF or GIF\./],
  ['a video, which starts much as an iPhone photo does', { body: Buffer.from('\0\0\0\x18ftypisom\0\0\0\0') }, /The picture at .* is not a TIFF, PNG, JPEG, WebP, AVIF or GIF\./],
  ['a PDF', { body: '%PDF-1.7\n' }, /The picture at .* is a PDF, which is not supported yet\. Convert it to TIFF, PNG or JPEG/],
  ['a drawing in SVG', { body: '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg">' }, /The picture at .* is a drawing in SVG, which is not supported yet/],
];

for (const [what, answer, says] of badLinks) {
  test(`${what} stops the build with what to do`, async () => {
    await assert.rejects(readContent(await linked(), { fetch: web(answer).fetch, downloads: await tempDir('downloads') }), says);
  });
}

test('a picture given by its link and another in content/ is one too many', async () => {
  const dir = await content({ 'whatiiif.toml': `picture = "${releaseLink}"`, 'harbour.jpg': 'x' });
  await assert.rejects(readContent(dir, { fetch: web({}).fetch }), /content\/ holds harbour\.jpg, and whatiiif\.toml names a picture at https:.*: keep one or the other/);
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
  await assert.rejects(readContent(await content({ 'a.png': 'x', 'whatiiif.toml': 'titel = "Harbour"' })), /unknown setting "titel"; did you mean "title"\?/);
});
