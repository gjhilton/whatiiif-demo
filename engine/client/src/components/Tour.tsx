import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { Site } from '../site';
import { inLanguage } from '../language';

interface Props {
  site: Site;
  language: string;
  /** Which note the tour is at. */
  at: number;
  onGo: (index: number) => void;
  onEnd: () => void;
}

/** The tour: one note at a time, below the picture it moves the viewer around, with Back, Next and End. */
export function Tour({ site, language, at, onGo, onEnd }: Props) {
  const panel = useRef<HTMLElement>(null);
  const notes = site.notes!.items;
  const note = notes[at];
  const title = inLanguage(note.title, language, site);
  const text = note.text && inLanguage(note.text, language, site);
  const last = at === notes.length - 1;

  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' });
  }, [at]);
  // Keyboard focus moves into the tour when it starts, so Next is one Tab away, not back past the whole page.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onEnd();
  };

  return (
    <section className="tour" ref={panel} aria-label="Tour" onKeyDown={keys}>
      <div aria-live="polite">
        <p className="tour-step">Note {at + 1} of {notes.length}</p>
        <h2 lang={title.lang} ref={heading} tabIndex={-1}>{title.text}</h2>
        {text && <div className="prose" lang={text.lang} dangerouslySetInnerHTML={{ __html: text.text }} />}
      </div>
      <p className="tour-buttons">
        <button type="button" onClick={() => onGo(at - 1)} disabled={at === 0}>Back</button>
        <button type="button" onClick={() => (last ? onEnd() : onGo(at + 1))}>{last ? 'End the tour' : 'Next'}</button>
        {!last && <button type="button" className="quiet" onClick={onEnd}>End the tour</button>}
      </p>
    </section>
  );
}
