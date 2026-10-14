// content/, which belongs to the site's owner: one picture, the settings in whatiiif.toml, and descriptions in
// description.md and description.<language>.md.
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { marked } from 'marked';
import { LANGUAGE, parseConfig } from './config.js';
import { findImage } from './source.js';

const readOptional = (path) => readFile(path, 'utf8').catch((error) => (error.code === 'ENOENT' ? undefined : Promise.reject(error)));

/** description.md, in the site's language, and description.<language>.md for any other, as HTML. */
async function descriptions(dir, language) {
  const html = {};
  for (const file of (await readdir(dir)).sort()) {
    const match = /^description(?:\.([^.]+))?\.md$/.exec(file);
    if (!match || (match[1] !== undefined && !LANGUAGE.test(match[1]))) continue;
    html[match[1] ?? language] = marked.parse(await readFile(join(dir, file), 'utf8'));
  }
  return Object.keys(html).length ? html : undefined;
}

/** Every language the texts are written in: the site's own first, then the rest alphabetically. */
function languagesOf(language, texts) {
  const found = new Set(texts.filter(Boolean).flatMap(Object.keys));
  found.delete(language);
  return [language, ...[...found].sort()];
}

/**
 * Everything in `dir` that the site is made from: the picture, the settings with their defaults, the description
 * as HTML (a language map, like every text), and every language any of those texts is in.
 */
export async function readContent(dir) {
  const image = await findImage(dir);
  const config = parseConfig((await readOptional(join(dir, 'whatiiif.toml'))) ?? '', { imageName: basename(image.path) });
  const description = await descriptions(dir, config.language);
  const { title, summary, attribution, alt, metadata } = config;
  const texts = [title, summary, attribution, alt, description, ...metadata.flatMap(({ label, value }) => [label, value])];
  return { image, config, description, languages: languagesOf(config.language, texts) };
}
