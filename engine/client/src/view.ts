import type { Site, ViewerId } from './site';

/** A rectangle of the image, in the image's own pixels. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
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

/** The region in a W3C media fragment such as #xywh=1200,800,900,600, if there is one. */
export function regionFromHash(hash: string, site: Site): Region | undefined {
  const match = /^#xywh=(?:pixel:)?(\d+),(\d+),(\d+),(\d+)$/.exec(hash);
  if (!match) return undefined;
  const [x, y, w, h] = match.slice(1).map(Number);
  return withinImage({ x, y, w, h }, site);
}

export const regionHash = (region?: Region) => (region ? `#xywh=${region.x},${region.y},${region.w},${region.h}` : '');

/** The address of the page as it is being looked at: viewer, language and part of the picture. */
export function pageLink(site: Site, { viewer, language, region, embed = false }: { viewer: ViewerId; language: string; region?: Region; embed?: boolean }) {
  const query = [embed && 'embed', `viewer=${viewer}`, site.languages.length > 1 && `lang=${encodeURIComponent(language)}`].filter(Boolean);
  return `${site.pageUrl}?${query.join('&')}${regionHash(region)}`;
}

const attribute = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** HTML that puts the picture, at the view in `src`, on someone else's web page. */
export const embedCode = (src: string, title: string) =>
  `<iframe src="${attribute(src)}" width="800" height="600" style="border:0" allowfullscreen loading="lazy" title="${attribute(title)}"></iframe>`;
