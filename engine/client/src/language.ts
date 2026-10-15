import type { Site, Text } from './site';

const primary = (tag: string) => tag.toLowerCase().split('-')[0];

/**
 * The language to show: the first of `wanted` (the one the address asks for, then the browser's) that the site has,
 * exactly or as a close relative (cy for cy-GB), else the site's own.
 */
export function chooseLanguage(site: Site, wanted: readonly (string | undefined)[]): string {
  for (const tag of wanted) {
    if (!tag) continue;
    const found =
      site.languages.find((language) => language.toLowerCase() === tag.toLowerCase()) ??
      site.languages.find((language) => primary(language) === primary(tag));
    if (found) return found;
  }
  return site.language;
}

/** The `lang` attribute for text in `language`: none for IIIF's "none", text in no particular language. */
export const htmlLang = (language: string) => (language === 'none' ? undefined : language);

/** A text in `language`, else in the site's language, else in any it has; `lang` is the language it is really in. */
export function inLanguage(text: Text, language: string, site: Site): { text: string; lang?: string } {
  const found = [language, site.language, ...Object.keys(text)].find((tag) => tag in text)!;
  return { text: text[found], lang: htmlLang(found) };
}

/** A language's own name for itself, such as Cymraeg for cy. */
export function languageName(language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
  } catch {
    return language;
  }
}
