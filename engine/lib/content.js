// content/, which belongs to the site's owner: one picture (or the link to one in whatiiif.toml), the settings in
// whatiiif.toml, and descriptions in description.md and description.<language>.md.
import { createWriteStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Marked } from 'marked';
import { LANGUAGE_EXAMPLE, languageCode, parseConfig } from './config.js';
import { findImage, listImages, sniff } from './source.js';
import { closest } from './spelling.js';

const DESCRIPTION = /^description(?:\.([^.]+))?\.md$/;
const KNOWN = ['whatiiif.toml', 'description.md'];

// The page's title is its one top-level heading, so a description's headings start a level below it.
const markdown = new Marked({
  walkTokens(token) {
    if (token.type === 'heading') token.depth = Math.min(token.depth + 1, 6);
  },
});

const readOptional = (path) => readFile(path, 'utf8').catch((error) => (error.code === 'ENOENT' ? undefined : Promise.reject(error)));

/** description.md, in the site's language, and description.<language>.md for any other, as HTML. */
async function descriptions(dir, files, language) {
  const html = {};
  const from = {};
  for (const file of files) {
    const match = DESCRIPTION.exec(file);
    const tag = match && (match[1] === undefined ? language : languageCode(match[1]));
    if (!tag) continue;
    if (from[tag]) throw new Error(`content/${from[tag]} and content/${file} are both in ${tag}; keep one`);
    from[tag] = file;
    html[tag] = await markdown.parse(await readFile(join(dir, file), 'utf8'));
  }
  return Object.keys(html).length ? html : undefined;
}

/** What to tell the owner about each file in content/ that will not be published, or used to make the site. */
function unused(files, { images, unsupported }, image) {
  const notes = [];
  for (const file of files) {
    if (file.startsWith('.') || file === 'whatiiif.toml' || file === image.name) continue;
    const description = DESCRIPTION.exec(file);
    if (description) {
      if (description[1] !== undefined && !languageCode(description[1])) {
        notes.push(`content/${file} is not used: "${description[1]}" is not ${LANGUAGE_EXAMPLE}.`);
      }
    } else if (images.includes(file) || unsupported.includes(file)) {
      notes.push(`content/${file} is not published: only ${image.name} is.`);
    } else {
      const meant = closest(file, KNOWN) ?? closest(basename(file, extname(file)), KNOWN);
      notes.push(`content/${file} is not used${meant ? `; did you mean ${meant}?` : '. content/ holds one picture, whatiiif.toml and description.md.'}`);
    }
  }
  return notes;
}

/** The picture at `url`, downloaded into `dir`: where it is now, what it is called and what kind of picture it is. */
async function download(url, dir, fetch) {
  const problem = (why) => new Error(`Could not download the picture at ${url}: ${why}`);
  const response = await fetch(url).catch((error) => Promise.reject(problem(`${error.cause?.message ?? error.message}.`)));
  if (!response.ok) {
    throw problem(
      `the server answered ${response.status}${response.statusText ? ` ${response.statusText}` : ''}. Check that the link is right and that anyone can open it: paste it into a private browser window.`,
    );
  }
  const path = join(dir, 'picture');
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path));

  const { format, name, page } = await sniff(path);
  if (page) {
    throw new Error(`${url} is a web page, not a picture. Use a link that downloads the picture itself: on GitHub, the link of the file under a release's Assets.`);
  }
  if (!format) {
    throw new Error(
      name
        ? `The picture at ${url} is a ${name}, which is not supported yet. Convert it to TIFF, PNG or JPEG and link to that instead.`
        : `The picture at ${url} is not a TIFF, PNG or JPEG.`,
    );
  }
  const file = basename(new URL(url).pathname);
  let fileName;
  try {
    fileName = decodeURIComponent(file);
  } catch {
    fileName = file;
  }
  return { path, name: fileName || 'picture', format, bytes: (await stat(path)).size, url };
}

/** Every language the texts are written in: the site's own first, then the rest alphabetically. */
function languagesOf(language, texts) {
  const found = new Set(texts.filter(Boolean).flatMap(Object.keys));
  found.delete(language);
  return [language, ...[...found].sort()];
}

/**
 * Everything in `dir` that the site is made from: the picture, the settings with their defaults, the description
 * as HTML (a language map, like every text), every language any of those texts is in, and `notes` on files in
 * `dir` that are not used. A picture named by its link in the settings is downloaded into `downloads` with `fetch`.
 */
export async function readContent(dir, { fetch = globalThis.fetch, downloads } = {}) {
  const files = (await readdir(dir)).sort();
  const settings = parseConfig((await readOptional(join(dir, 'whatiiif.toml'))) ?? '');
  const pictures = await listImages(dir);

  let image;
  if (settings.picture) {
    const committed = [...pictures.images, ...pictures.unsupported];
    if (committed.length) {
      throw new Error(`content/ holds ${committed.join(', ')}, and whatiiif.toml names a picture at ${settings.picture}: keep one or the other.`);
    }
    image = await download(settings.picture, downloads, fetch);
  } else {
    image = await findImage(dir);
  }

  const title = settings.title ?? { [settings.language]: basename(image.name, extname(image.name)) };
  const config = { ...settings, title, alt: settings.alt ?? title };
  const description = await descriptions(dir, files, config.language);
  const { summary, attribution, alt, metadata } = config;
  const texts = [title, summary, attribution, alt, description, ...metadata.flatMap(({ label, value }) => [label, value])];
  return { image, config, description, languages: languagesOf(config.language, texts), notes: unused(files, pictures, image) };
}
