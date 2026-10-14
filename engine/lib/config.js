// content/whatiiif.toml: what the site's owner wrote, checked and turned into settings with every default applied.
// Its readers are not programmers, so every mistake is explained in a sentence that says what to write instead.
import { parse } from 'smol-toml';
import { basename, extname } from 'node:path';

export const VIEWERS = ['openseadragon', 'mirador'];
// A BCP 47 language tag (en, cy, de-CH, zh-Hant), or IIIF's "none" for text in no particular language.
export const LANGUAGE = /^(none|[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*)$/;
const LANGUAGE_EXAMPLE = 'a language code such as en, cy or de-CH';
const TILE_SIZES = [64, 4096];

// The settings each part of the file may hold.
const SETTINGS = {
  '': ['language', 'title', 'summary', 'attribution', 'alt', 'rights', 'viewer', 'base_url', 'metadata', 'tiles', 'publish'],
  tiles: ['size', 'quality'],
  publish: ['full'],
  metadata: ['label', 'value'],
};

// IIIF only accepts Creative Commons and RightsStatements.org URIs as `rights`, in the http:// form they are defined with.
const RIGHTS = /^https?:\/\/(?:www\.)?((?:creativecommons\.org\/(?:licenses|publicdomain)|rightsstatements\.org\/vocab)\/.+)$/;

const fail = (message) => {
  throw new Error(`content/whatiiif.toml: ${message}`);
};

/** A value as it was written in the file: text in quotes, a number or date as it is. */
const written = (value) => (typeof value === 'string' ? `"${value}"` : value instanceof Date ? value.toISOString() : String(value));
const unquoted = (value) => (value instanceof Date ? value.toISOString() : String(value));
const isTable = (value) => typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);

function checkKeys(table, part) {
  for (const key of Object.keys(table)) {
    if (!SETTINGS[part].includes(key)) {
      fail(`unknown setting "${part ? `${part}.` : ''}${key}". Valid settings here: ${SETTINGS[part].join(', ')}`);
    }
  }
}

/** A [section] of the file, such as [tiles]: absent means empty. */
function section(raw, name) {
  const table = raw[name] ?? {};
  if (!isTable(table)) fail(`"${name}" must be a section, [${name}], not a single value`);
  checkKeys(table, name);
  return table;
}

/**
 * A text setting as a language map, `{ en: "Harbour", cy: "Harbwr" }`: plain text is in the site's `language`, a
 * table gives the text in each language it was written in. Blank texts count as not given.
 */
function text(value, setting, language) {
  if (value === undefined) return undefined;
  const words = (given, name, otherwise = '') => {
    if (typeof given !== 'string') fail(`"${name}" must be text in double quotes, like "${unquoted(given)}"${otherwise}`);
    return given.trim();
  };
  if (!isTable(value)) {
    const plain = words(value, setting, ', or a table of texts by language such as { en = "Harbour", cy = "Harbwr" }');
    return plain ? { [language]: plain } : undefined;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) fail(`"${setting}" is an empty table; give the text, or one entry per language`);
  const map = {};
  for (const [tag, given] of entries) {
    if (!LANGUAGE.test(tag)) fail(`"${setting}" has "${tag}", which is not ${LANGUAGE_EXAMPLE}`);
    const trimmed = words(given, `${setting}.${tag}`);
    if (trimmed) map[tag] = trimmed;
  }
  return Object.keys(map).length ? map : undefined;
}

function metadata(raw, language) {
  const entries = raw ?? [];
  const malformed = () => fail('"metadata" must be a list of [[metadata]] entries, each with a "label" and a "value"');
  if (!Array.isArray(entries)) malformed();
  return entries.map((entry, i) => {
    if (!isTable(entry)) malformed();
    checkKeys(entry, 'metadata');
    const label = text(entry.label, 'metadata.label', language);
    const value = text(entry.value, 'metadata.value', language);
    if (!label || !value) fail(`each [[metadata]] entry needs a "label" and a "value" (entry ${i + 1})`);
    return { label, value };
  });
}

function rights(value) {
  if (value === undefined) return undefined;
  const known = typeof value === 'string' && RIGHTS.exec(value);
  if (!known) {
    fail(
      `"rights" must be a Creative Commons or RightsStatements.org URL, for example https://creativecommons.org/licenses/by/4.0/ (got ${written(value)}). Describe any other terms in "attribution" instead.`,
    );
  }
  return `http://${known[1]}`;
}

function baseUrl(value) {
  if (value === undefined) return undefined;
  let url;
  try {
    url = typeof value === 'string' && new URL(value);
  } catch {}
  if (!url || !['http:', 'https:'].includes(url.protocol)) {
    fail(`"base_url" must be a URL such as https://example.org/my-image (got ${written(value)})`);
  }
  return value.replace(/\/+$/, '');
}

function wholeNumber(value, setting, [min, max]) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`"${setting}" must be a whole number from ${min} to ${max} (got ${written(value)})`);
  }
  return value;
}

/** Parses whatiiif.toml text into settings with defaults applied. Throws readable errors. */
export function parseConfig(toml, { imageName }) {
  let raw;
  try {
    raw = parse(toml);
  } catch (error) {
    throw new Error(`content/whatiiif.toml is not valid TOML: ${error.message}`);
  }
  checkKeys(raw, '');
  const tiles = section(raw, 'tiles');
  const publish = section(raw, 'publish');

  const language = raw.language ?? 'en';
  if (typeof language !== 'string' || !LANGUAGE.test(language)) fail(`"language" must be ${LANGUAGE_EXAMPLE} (got ${written(language)})`);
  const title = text(raw.title, 'title', language) ?? { [language]: basename(imageName, extname(imageName)) };

  const viewer = raw.viewer ?? VIEWERS[0];
  if (!VIEWERS.includes(viewer)) fail(`"viewer" must be one of: ${VIEWERS.join(', ')} (got ${written(viewer)})`);
  const full = publish.full ?? true;
  if (typeof full !== 'boolean') fail(`"publish.full" must be true or false, without quotes (got ${written(full)})`);

  return {
    language,
    title,
    summary: text(raw.summary, 'summary', language),
    attribution: text(raw.attribution, 'attribution', language),
    alt: text(raw.alt, 'alt', language) ?? title,
    rights: rights(raw.rights),
    viewer,
    base_url: baseUrl(raw.base_url),
    metadata: metadata(raw.metadata, language),
    tiles: {
      size: wholeNumber(tiles.size ?? 512, 'tiles.size', TILE_SIZES),
      quality: wholeNumber(tiles.quality ?? 85, 'tiles.quality', [1, 100]),
    },
    publish: { full },
  };
}
