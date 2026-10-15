// How the page puts things for a visitor: a licence by its short name, a file by its kind and size, a citation,
// and a length on the scale bar.
import type { Site } from './site';
import { inLanguage } from './language.ts'; // with its extension, so engine/test can run this file in Node as it is

// RightsStatements.org's statements, by the code in their address.
const STATEMENTS: Record<string, string> = {
  InC: 'In Copyright',
  'InC-OW-EU': 'In Copyright – EU Orphan Work',
  'InC-EDU': 'In Copyright – Educational Use Permitted',
  'InC-NC': 'In Copyright – Non-Commercial Use Permitted',
  'InC-RUU': 'In Copyright – Rights-holder(s) Unlocatable or Unidentifiable',
  'NoC-CR': 'No Copyright – Contractual Restrictions',
  'NoC-NC': 'No Copyright – Non-Commercial Use Only',
  'NoC-OKLR': 'No Copyright – Other Known Legal Restrictions',
  'NoC-US': 'No Copyright – United States',
  CNE: 'Copyright Not Evaluated',
  UND: 'Copyright Undetermined',
  NKC: 'No Known Copyright',
};

/** A rights URI, as the build writes them, by the name its publisher gives it: CC BY 4.0, In Copyright. */
export function rightsName(url: string): string {
  const [, licence, version, jurisdiction] = /^http:\/\/creativecommons\.org\/licenses\/([a-z-]+)\/([\d.]+)\/(?:([a-z-]+)\/)?$/.exec(url) ?? [];
  if (licence) return ['CC', licence.toUpperCase(), version, jurisdiction?.toUpperCase()].filter(Boolean).join(' ');
  const [, tool, toolVersion] = /^http:\/\/creativecommons\.org\/publicdomain\/(zero|mark)\/([\d.]+)\/$/.exec(url) ?? [];
  if (tool) return `${tool === 'zero' ? 'CC0' : 'Public Domain Mark'} ${toolVersion}`;
  const [, statement] = /^http:\/\/rightsstatements\.org\/vocab\/([\w-]+)\/[\d.]+\/$/.exec(url) ?? [];
  return STATEMENTS[statement] ?? url;
}

/** A number of bytes as a computer shows a file's size: 48 KB, 4.1 MB, 123 MB. */
export function fileSize(bytes: number): string {
  const [amount, unit] = bytes >= 1e9 ? [bytes / 1e9, 'GB'] : bytes >= 1e6 ? [bytes / 1e6, 'MB'] : [Math.max(1, bytes / 1e3), 'KB'];
  return `${amount < 10 && unit !== 'KB' ? amount.toFixed(1) : Math.round(amount)} ${unit}`;
}

/** A picture's media type by the name people know its format by. */
export const formatName = (mediaType: string) =>
  ({ 'image/tiff': 'TIFF', 'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP', 'image/avif': 'AVIF', 'image/gif': 'GIF' })[mediaType] ?? mediaType;

/**
 * The picture cited as a reader sees it, in `language` and at the view in `link`: who made it and when, its title,
 * who to credit, and the day it was `viewed`.
 */
export function citation(site: Site, language: string, link: string, viewed: Date): string {
  const words = (text?: Site['title']) => text && inLanguage(text, language, site).text;
  const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);
  const [creator, date, title, credit] = [words(site.creator), words(site.date), words(site.title)!, words(site.attribution)];
  const when = date ? ` (${date})` : '';
  const what = creator ? `${creator}${when} ${sentence(title)}` : sentence(`${title}${when}`);
  const day = viewed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return [what, credit && sentence(credit), `Available at: ${link} (Accessed: ${day}).`].filter(Boolean).join(' ');
}

export type Unit = 'mm' | 'cm' | 'm' | 'in';
const MILLIMETRES = { mm: 1, cm: 10, m: 1000 };

/**
 * The scale bar for a view in which one screen pixel covers `perPixel` of `unit` of the original: the longest round
 * length (1, 2 or 5, times a power of ten) no more than `longest` pixels long, in metric or in inches.
 */
export function scaleLength(perPixel: number, unit: Unit, longest = 100): { pixels: number; label: string } {
  const [perPixelInBase, base] = unit === 'in' ? [perPixel, 1] : [perPixel * MILLIMETRES[unit], 1];
  const fits = longest * perPixelInBase * base;
  const power = 10 ** Math.floor(Math.log10(fits));
  const length = Number(([5, 2, 1].map((step) => step * power).find((step) => step <= fits) ?? power).toPrecision(12));
  const pixels = length / perPixelInBase;
  if (unit === 'in') return { pixels, label: `${length} in` };
  const [amount, name] = length >= 1000 ? [length / 1000, 'm'] : length >= 10 ? [length / 10, 'cm'] : [length, 'mm'];
  return { pixels, label: `${Number(amount.toPrecision(12))} ${name}` };
}
