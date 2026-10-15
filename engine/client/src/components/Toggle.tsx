import { htmlLang } from '../language';

/** A row of buttons, one of them pressed. With `lang`, each option is a language and its button is marked as in it. */
export function Toggle<T extends string>({ label, options, chosen, onChoose, name, lang = false }: {
  label: string;
  options: readonly T[];
  chosen: T;
  onChoose: (option: T) => void;
  name: (option: T) => string;
  lang?: boolean;
}) {
  return (
    <div className="toggle" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option} type="button" lang={lang ? htmlLang(option) : undefined} aria-pressed={option === chosen} onClick={() => onChoose(option)}>
          {name(option)}
        </button>
      ))}
    </div>
  );
}
