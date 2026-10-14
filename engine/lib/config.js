import { parse } from 'smol-toml';
import { basename, extname } from 'node:path';

export const VIEWERS = ['openseadragon', 'mirador'];
const TOP_LEVEL = ['language', 'title', 'summary', 'attribution', 'alt', 'rights', 'viewer', 'base_url', 'metadata', 'tiles', 'publish'];
// A BCP 47 language tag (en, cy, de-CH, zh-Hant), or IIIF's "none" for text in no particular language.
export const LANGUAGE = /^(none|[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*)$/;
const LANGUAGE_EXAMPLE = 'a language code such as en, cy or de-CH';

const fail = (message) => {
  throw new Error(`content/whatiiif.toml: ${message}`);
};

function checkKeys(table, allowed, where) {
  for (const key of Object.keys(table)) {
    if (!allowed.includes(key)) fail(`unknown setting "${where}${key}". Valid settings here: ${allowed.join(', ')}`);
  }
}

/**
 * A text setting as a language map, `{ en: "Harbour", cy: "Harbwr" }`: plain text is in the site's `language`,
 * a table gives the text in each language it was written in.
 */
function text(value, setting, language) {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return { [language]: value };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`"${setting}" must be text, or a table of texts by language such as { en = "Harbour", cy = "Harbwr" }`);
  }
  const entries = Object.entries(value);
  if (entries.length === 0) fail(`"${setting}" is an empty table; give the text, or one entry per language`);
  for (const [tag, words] of entries) {
    if (!LANGUAGE.test(tag)) fail(`"${setting}" has "${tag}", which is not ${LANGUAGE_EXAMPLE}`);
    if (typeof words !== 'string') fail(`"${setting}.${tag}" must be text`);
  }
  return Object.fromEntries(entries);
}

// IIIF only accepts Creative Commons and RightsStatements.org URIs as `rights`, in the http:// form they are defined with.
const RIGHTS = /^https?:\/\/(?:www\.)?((?:creativecommons\.org\/(?:licenses|publicdomain)|rightsstatements\.org\/vocab)\/.+)$/;

const isHttpUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** Parses whatiiif.toml text into a config with defaults applied. Throws readable errors. */
export function parseConfig(toml, { imageName }) {
  let raw;
  try {
    raw = parse(toml);
  } catch (error) {
    throw new Error(`content/whatiiif.toml is not valid TOML: ${error.message}`);
  }
  checkKeys(raw, TOP_LEVEL, '');

  const tiles = raw.tiles ?? {};
  const publish = raw.publish ?? {};
  checkKeys(tiles, ['size', 'quality'], 'tiles.');
  checkKeys(publish, ['full'], 'publish.');

  const language = raw.language ?? 'en';
  if (typeof language !== 'string' || !LANGUAGE.test(language)) fail(`"language" must be ${LANGUAGE_EXAMPLE} (got "${language}")`);
  const title = text(raw.title, 'title', language) ?? { [language]: basename(imageName, extname(imageName)) };

  const config = {
    language,
    title,
    summary: text(raw.summary, 'summary', language),
    attribution: text(raw.attribution, 'attribution', language),
    alt: text(raw.alt, 'alt', language) ?? title,
    rights: raw.rights,
    viewer: raw.viewer ?? VIEWERS[0],
    base_url: raw.base_url?.replace(/\/+$/, ''),
    metadata: (raw.metadata ?? []).map((pair, i) => {
      if (pair.label === undefined || pair.value === undefined) fail(`each [[metadata]] entry needs a "label" and a "value" (entry ${i + 1})`);
      checkKeys(pair, ['label', 'value'], 'metadata.');
      return { label: text(pair.label, 'metadata.label', language), value: text(pair.value, 'metadata.value', language) };
    }),
    tiles: { size: tiles.size ?? 512, quality: tiles.quality ?? 85 },
    publish: { full: publish.full ?? true },
  };

  if (config.rights !== undefined) {
    const known = RIGHTS.exec(config.rights);
    if (!known) {
      fail(
        `"rights" must be a Creative Commons or RightsStatements.org URL, for example https://creativecommons.org/licenses/by/4.0/ (got "${config.rights}"). Describe any other terms in "attribution" instead.`,
      );
    }
    config.rights = `http://${known[1]}`;
  }
  if (!VIEWERS.includes(config.viewer)) {
    fail(`"viewer" must be one of: ${VIEWERS.join(', ')} (got "${config.viewer}")`);
  }
  if (config.base_url !== undefined && !isHttpUrl(config.base_url)) {
    fail(`"base_url" must be a URL such as https://example.org/my-image (got "${config.base_url}")`);
  }
  if (!Number.isInteger(config.tiles.size) || config.tiles.size < 1) {
    fail(`"tiles.size" must be a positive whole number (got ${config.tiles.size})`);
  }
  if (!Number.isInteger(config.tiles.quality) || config.tiles.quality < 1 || config.tiles.quality > 100) {
    fail(`"tiles.quality" must be a whole number from 1 to 100 (got ${config.tiles.quality})`);
  }
  return config;
}
