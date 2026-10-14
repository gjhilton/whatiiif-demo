import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { readContent } from './content.js';
import { slice } from './slice.js';
import { applyBudget } from './budget.js';
import { missingFiles } from './service.js';
import { buildManifest } from './manifest.js';
import { originalUrl, committedToLfs } from './original.js';
import { cardImage, personalisePage } from './page.js';

const LOCAL_BASE_URL = 'http://localhost:4173';

/**
 * Turns the committed content into everything in `outDir` that depends on it: the IIIF image service and
 * manifest under iiif/, site.json, which the preview page loads when it opens, and, if the page has been
 * built already, its title, social-card tags and the fallback shown without JavaScript.
 */
export async function build({ contentDir, outDir, env = process.env, log = () => {} }) {
  const { image, config, description, languages } = await readContent(contentDir);

  const baseUrl = (config.base_url ?? env.SITE_BASE_URL ?? LOCAL_BASE_URL).replace(/\/+$/, '');
  const pageUrl = `${baseUrl}/`;
  const imageId = `${baseUrl}/iiif/image`;
  const manifestId = `${baseUrl}/iiif/manifest.json`;
  const imageDir = join(outDir, 'iiif/image');

  log(`Slicing ${image.name}…`);
  await rm(imageDir, { recursive: true, force: true }); // a rebuild must not inherit tiles from the previous image
  const { size: tileSize, quality } = config.tiles;
  const info = await slice({ source: image.path, outDir: imageDir, id: imageId, tileSize, quality, publishFull: config.publish.full });

  const { bytes, droppedFull } = await applyBudget({ dir: imageDir, info });
  if (droppedFull) log('Site was over the Pages size budget, so the full-size download (full/max) was left out.');

  const missing = await missingFiles(imageDir);
  if (missing.length) {
    throw new Error(`The generated IIIF service is incomplete, so nothing was deployed. Missing:\n - ${missing.join('\n - ')}`);
  }

  const lfs = await committedToLfs(image.path);
  const url = originalUrl({ repo: env.GITHUB_REPOSITORY, ref: env.GITHUB_REF_NAME, path: `content/${image.name}`, lfs });
  const hasFull = config.publish.full && !droppedFull;
  const manifest = buildManifest({ manifestId, imageId, pageUrl, info, config, hasFull, original: url && { url, format: image.format } });
  await writeFile(join(outDir, 'iiif/manifest.json'), JSON.stringify(manifest, null, 2));

  const site = {
    language: config.language,
    languages,
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
    originalUrl: url,
    width: info.width,
    height: info.height,
    pageUrl,
  };
  await writeFile(join(outDir, 'site.json'), JSON.stringify(site, null, 2));
  await personalisePage(join(outDir, 'index.html'), { site, image: cardImage({ info, imageId }) });

  log(`Done: ${Math.round(bytes / 1024 / 1024)} MB of IIIF files at ${baseUrl}/iiif/`);
  return { baseUrl, manifestId, bytes, droppedFull };
}
