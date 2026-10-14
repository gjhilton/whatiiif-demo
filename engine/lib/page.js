// What a built page says about its image before any script runs: the title and social-card tags in its head,
// and a plain fallback for browsers without JavaScript. The page Vite builds is the same for every image;
// engine/build.js fills these in between marker comments afterwards.
import { readFile, writeFile } from 'node:fs/promises';

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** A text in the site's own language (else any it has), with the `lang` attribute that goes with it. */
function inSiteLanguage(text, site) {
  const language = site.language in text ? site.language : Object.keys(text)[0];
  return { text: escape(text[language]), lang: language === 'none' ? '' : ` lang="${escape(language)}"` };
}

/** The whole-image file a card or the fallback shows: the largest listed size up to `maxWidth`, else the image itself. */
export function cardImage({ info, imageId, maxWidth = 1200 }) {
  const size = [...info.sizes].reverse().find((s) => s.width <= maxWidth);
  if (size) return { url: `${imageId}/full/${size.width},${size.height}/0/default.jpg`, width: size.width, height: size.height };
  // With no sizes listed the image fits one tile, which is published as full/max.
  return { url: `${imageId}/full/max/0/default.jpg`, width: info.width, height: info.height };
}

/** The <title> and the tags that make a shared link show the image, its title and summary. */
export function pageHead({ site, image }) {
  const title = inSiteLanguage(site.title, site).text;
  const summary = site.summary && inSiteLanguage(site.summary, site).text;
  const meta = (attribute, name, content) => `<meta ${attribute}="${name}" content="${content}">`;
  return [
    `<title>${title}</title>`,
    meta('name', 'description', summary ?? title),
    `<link rel="canonical" href="${escape(site.pageUrl)}">`,
    meta('property', 'og:type', 'website'),
    meta('property', 'og:url', escape(site.pageUrl)),
    meta('property', 'og:title', title),
    summary && meta('property', 'og:description', summary),
    meta('property', 'og:image', escape(image.url)),
    meta('property', 'og:image:width', image.width),
    meta('property', 'og:image:height', image.height),
    meta('property', 'og:image:alt', inSiteLanguage(site.alt, site).text),
    meta('name', 'twitter:card', 'summary_large_image'),
  ]
    .filter(Boolean)
    .join('\n    ');
}

/** What a browser without JavaScript shows instead of the viewer: the picture, described, and where to get more. */
export function pageFallback({ site, image }) {
  const title = inSiteLanguage(site.title, site);
  const summary = site.summary && inSiteLanguage(site.summary, site);
  const alt = inSiteLanguage(site.alt, site);
  const links = [
    `<a href="${escape(site.manifestUrl)}">IIIF manifest</a>`,
    site.fullUrl && `<a href="${escape(site.fullUrl)}">Full-size JPEG</a>`,
    site.originalUrl && `<a href="${escape(site.originalUrl)}">Original file</a>`,
  ].filter(Boolean);
  return [
    '<noscript><div class="fallback">',
    `<h1${title.lang}>${title.text}</h1>`,
    summary && `<p${summary.lang}>${summary.text}</p>`,
    `<img src="${escape(image.url)}" width="${image.width}" height="${image.height}" alt="${alt.text}"${alt.lang}>`,
    `<p>${links.join(' · ')}</p>`,
    '</div></noscript>',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Writes the head tags and the fallback into a built page, between its `<!-- whatiiif:… -->` markers, so doing it
 * again replaces them. Returns false when there is no built page to personalise.
 */
export async function personalisePage(file, parts) {
  let html;
  try {
    html = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  for (const [name, content] of [['head', pageHead(parts)], ['body', pageFallback(parts)]]) {
    const marked = new RegExp(`(<!-- whatiiif:${name} -->)[\\s\\S]*?(<!-- /whatiiif:${name} -->)`);
    if (!marked.test(html)) throw new Error(`${file} has no <!-- whatiiif:${name} --> markers; build the page again`);
    html = html.replace(marked, (_, open, close) => `${open}${content}${close}`);
  }
  await writeFile(file, html);
  return true;
}
