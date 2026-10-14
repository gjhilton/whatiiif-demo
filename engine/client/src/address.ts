// The page's address as a link to what is on screen: `?viewer=` and `?lang=` for the visitor's choices,
// `?embed` for the page inside someone else's, and a W3C media fragment, `#xywh=x,y,w,h`, for the part of the
// picture in view. Everything here works on addresses as text, so the page decides when to read or change its own.
import type { Site, ViewerId } from './site';

/** A rectangle of the image, in the image's own pixels. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What an address asks the page to show; `language` is only what it asks for, which the site may not have. */
export interface Asked {
  viewer?: ViewerId;
  language?: string;
  region?: Region;
  embed: boolean;
}

/** The part of `region` inside the image, in whole pixels; undefined when that is nothing, or all of it. */
export function withinImage(region: Region, site: Site): Region | undefined {
  const x = Math.max(0, Math.round(region.x));
  const y = Math.max(0, Math.round(region.y));
  const w = Math.min(site.width, Math.round(region.x + region.w)) - x;
  const h = Math.min(site.height, Math.round(region.y + region.h)) - y;
  if (w < 1 || h < 1) return undefined;
  if (x === 0 && y === 0 && w === site.width && h === site.height) return undefined; // the whole image needs no link
  return { x, y, w, h };
}

const fragment = (region?: Region) => (region ? `#xywh=${region.x},${region.y},${region.w},${region.h}` : '');

/** What `href` asks for, keeping only what makes sense for this site and the `viewers` the page offers. */
export function readAddress(href: string, site: Site, viewers: readonly string[]): Asked {
  const url = new URL(href);
  const viewer = url.searchParams.get('viewer');
  const match = /^#xywh=(?:pixel:)?(\d+),(\d+),(\d+),(\d+)$/.exec(url.hash);
  const [x, y, w, h] = match ? match.slice(1).map(Number) : [];
  return {
    viewer: viewer && viewers.includes(viewer) ? (viewer as ViewerId) : undefined,
    language: url.searchParams.get('lang') ?? undefined,
    region: match ? withinImage({ x, y, w, h }, site) : undefined,
    embed: url.searchParams.has('embed'),
  };
}

/** `href` with `key=value` in its query, as when the visitor chooses a viewer or a language. */
export function withChoice(href: string, key: 'viewer' | 'lang', value: string): string {
  const url = new URL(href);
  url.searchParams.set(key, value);
  return url.href;
}

/** `href` showing `region`; the whole picture has no fragment. */
export function withRegion(href: string, region?: Region): string {
  const url = new URL(href);
  url.hash = fragment(region);
  return url.href;
}

/** The link to the page as it is being looked at: viewer, language (where there is a choice) and part of the picture. */
export function linkTo(site: Site, { viewer, language, region, embed = false }: { viewer: ViewerId; language: string; region?: Region; embed?: boolean }) {
  const query = [embed && 'embed', `viewer=${viewer}`, site.languages.length > 1 && `lang=${encodeURIComponent(language)}`].filter(Boolean);
  return `${site.pageUrl}?${query.join('&')}${fragment(region)}`;
}

const attribute = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** HTML that puts the picture, at the view in `src`, on someone else's web page. */
export const embedCode = (src: string, title: string) =>
  `<iframe src="${attribute(src)}" width="800" height="600" style="border:0" allowfullscreen loading="lazy" title="${attribute(title)}"></iframe>`;
