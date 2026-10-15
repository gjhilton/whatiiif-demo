import type { Text } from '../site';
import { htmlLang, languageName } from '../language';

interface Props {
  label: string;
  hint?: string;
  /** The text in each language it is written in. */
  value?: Text;
  /** The site's language: the text's first box is in it. */
  language: string;
  multiline?: boolean;
  /** Whether to offer to add a translation; one already given is shown either way. */
  translatable?: boolean;
  onChange: (value: Text | undefined) => void;
}

/** A text in the site's language, with a box for each translation and a button to add one. */
export function TextField({ label, hint, value = {}, language, multiline = false, translatable = false, onChange }: Props) {
  const translations = Object.entries(value).filter(([tag]) => tag !== language);
  const change = (entries: [string, string][]) => {
    const map = Object.fromEntries(entries);
    onChange(Object.keys(map).length ? map : undefined);
  };
  const withMain = (words: string): [string, string][] => [[language, words], ...translations];
  const box = (words: string, update: (words: string) => void, lang?: string, name = label) =>
    multiline ? (
      <textarea value={words} lang={lang && htmlLang(lang)} rows={3} aria-label={name} onChange={(event) => update(event.target.value)} />
    ) : (
      <input value={words} lang={lang && htmlLang(lang)} aria-label={name} onChange={(event) => update(event.target.value)} />
    );

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {box(value[language] ?? '', (words) => change(withMain(words)), language)}
      {translations.map(([tag, words], i) => {
        const others = (replacement?: [string, string]) =>
          change([[language, value[language] ?? ''], ...translations.flatMap((entry, j) => (j === i ? (replacement ? [replacement] : []) : [entry]))]);
        return (
          <span key={i} className="translation">
            <input className="tag" value={tag} aria-label={`${label}: language of translation ${i + 1}`} onChange={(event) => others([event.target.value.trim(), words])} />
            {box(words, (next) => others([tag, next]), tag, `${label} in ${languageName(tag)}`)}
            <button type="button" className="quiet" aria-label={`Remove the ${languageName(tag)} ${label.toLowerCase()}`} onClick={() => others()}>
              Remove
            </button>
          </span>
        );
      })}
      {translatable && (
        <button type="button" className="quiet" onClick={() => change([...withMain(value[language] ?? ''), ['', '']])}>
          Add a translation
        </button>
      )}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
