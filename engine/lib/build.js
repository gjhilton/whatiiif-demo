import { readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { marked } from 'marked';
import { parseConfig, LANGUAGE } from './config.js';
import { findSourceImage } from './source.js';
import { slice } from './slice.js';
import { applyBudget } from './budget.js';
import { validate } from './validate.js';
import { buildManifest } from './manifest.js';
import { originalUrl, committedToLfs } from './original.js';
import { cardImage, personalisePage } from './page.js';

const LOCAL_BASE_URL = 'http://localhost:4173';

const readOptional = (path) => readFile(path, 'utf8').catch((e) => (e.code === 'ENOENT' ? undefined : Promise.reject(e)));

/** description.md, in the site language, and description.<language>.md for any other, as HTML; the site's author wrote it. */
async function descriptions(contentDir, language) {
  const html = {};
  for (const file of (await readdir(contentDir)).sort()) {
    const match = /^description(?:\.([^.]+))?\.md$/.exec(file);
    if (!match || (match[1] !== undefined && !LANGUAGE.test(match[1]))) continue;
    html[match[1] ?? language] = marked.parse(await readFile(join(contentDir, file), 'utf8'));
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
 * Turns the committed content into everything in `outDir` that depends on it: the IIIF image service and
 * manifest under iiif/, site.json, which the preview page loads when it opens, and, if the page has been
 * built already, its title, social-card tags and the fallback shown without JavaScript.
 */
export async function build({ contentDir, outDir, env = process.env, log = () => {} }) {
  const source = await findSourceImage(contentDir);
  const config = parseConfig((await readOptional(join(contentDir, 'whatiiif.toml'))) ?? '', { imageName: basename(source) });
  const description = await descriptions(contentDir, config.language);

  const baseUrl = (config.base_url ?? env.SITE_BASE_URL ?? LOCAL_BASE_URL).replace(/\/+$/, '');
  const imageId = `${baseUrl}/iiif/image`;
  const manifestId = `${baseUrl}/iiif/manifest.json`;
  const imageDir = join(outDir, 'iiif/image');

  log(`Slicing ${basename(source)}…`);
  await rm(imageDir, { recursive: true, force: true }); // a rebuild must not inherit tiles from the previous image
  await slice({ source, outDir: imageDir, id: imageId, tileSize: config.tiles.size, quality: config.tiles.quality, publishFull: config.publish.full });

  const info = JSON.parse(await readFile(join(imageDir, 'info.json'), 'utf8'));
  const { bytes, droppedFull } = await applyBudget({ dir: imageDir, info });
  if (droppedFull) log('Site was over the Pages size budget, so the full-size download (full/max) was left out.');

  const problems = await validate(imageDir);
  if (problems.length) {
    throw new Error(`The generated IIIF service is incomplete, so nothing was deployed:\n - ${problems.join('\n - ')}`);
  }

  const original = originalUrl({
    repo: env.GITHUB_REPOSITORY,
    ref: env.GITHUB_REF_NAME,
    path: `content/${basename(source)}`,
    lfs: await committedToLfs(source),
  });
  const hasFull = config.publish.full && !droppedFull;
  const manifest = buildManifest({ manifestId, imageId, info, config, hasFull, originalUrl: original });
  await writeFile(join(outDir, 'iiif/manifest.json'), JSON.stringify(manifest, null, 2));

  const texts = [config.title, config.summary, config.attribution, config.alt, description, ...config.metadata.flatMap((m) => [m.label, m.value])];
  const site = {
    language: config.language,
    languages: languagesOf(config.language, texts),
    title: config.title,
    summary: config.summary,
    attribution: config.attribution,
    alt: config.alt,
    rights: config.rights,
    metadata: config.metadata,
    description,
    viewer: config.viewer,
    manifestUrl: manifestId,
    canvasId: manifest.items[0].id,
    infoUrl: `${imageId}/info.json`,
    fullUrl: hasFull ? `${imageId}/full/max/0/default.jpg` : undefined,
    originalUrl: original,
    width: info.width,
    height: info.height,
    pageUrl: `${baseUrl}/`,
  };
  await writeFile(join(outDir, 'site.json'), JSON.stringify(site, null, 2));
  await personalisePage(join(outDir, 'index.html'), { site, image: cardImage({ info, imageId }) });

  log(`Done: ${Math.round(bytes / 1024 / 1024)} MB of IIIF files at ${baseUrl}/iiif/`);
  return { baseUrl, manifestId, bytes, droppedFull };
}
