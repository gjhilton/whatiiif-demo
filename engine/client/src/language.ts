import type { Site, Text } from './site';

const primary = (tag: string) => tag.toLowerCase().split('-')[0];

/** The language to show: ?lang= if the site has it, else the first of the browser's languages it has, else its own. */
export function chooseLanguage(site: Site): string {
  const asked = new URLSearchParams(location.search).get('lang');
  for (const wanted of [asked, ...navigator.languages]) {
    if (!wanted) continue;
    const exact = site.languages.find((language) => language.toLowerCase() === wanted.toLowerCase());
    const close = site.languages.find((language) => primary(language) === primary(wanted)); // cy serves cy-GB
    if (exact ?? close) return (exact ?? close)!;
  }
  return site.language;
}

/** A text in `language`, else in the site's language, else in any it has; `lang` is the language it is really in. */
export function inLanguage(text: Text, language: string, site: Site): { text: string; lang?: string } {
  const found = [language, site.language, ...Object.keys(text)].find((tag) => tag in text)!;
  return { text: text[found], lang: found === 'none' ? undefined : found };
}

/** A language's own name for itself, such as Cymraeg for cy. */
export function languageName(language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
  } catch {
    return language;
  }
}
