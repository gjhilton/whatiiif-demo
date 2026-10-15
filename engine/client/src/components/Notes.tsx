import type { RefObject } from 'react';
import type { Site } from '../site';
import { inLanguage } from '../language';

interface Props {
  site: Site;
  language: string;
  /** The note the viewer was last taken to, if any. */
  current?: number;
  onShow: (index: number) => void;
  onTour: () => void;
  /** The Take the tour button, which has keyboard focus back when the tour ends. */
  tourButton: RefObject<HTMLButtonElement | null>;
}

/** The notes on the picture, numbered as their markers are; each title takes the viewer to its part. */
export function Notes({ site, language, current, onShow, onTour, tourButton }: Props) {
  if (!site.notes) return null;
  const words = (text: Site['title']) => inLanguage(text, language, site);
  const intro = site.notes.intro && words(site.notes.intro);
  return (
    <section className="notes" aria-labelledby="notes-heading">
      <div className="notes-heading">
        <h2 id="notes-heading">Notes</h2>
        <button type="button" onClick={onTour} ref={tourButton}>Take the tour</button>
      </div>
      {intro && <div className="prose" lang={intro.lang} dangerouslySetInnerHTML={{ __html: intro.text }} />}
      <ol>
        {site.notes.items.map((note, i) => {
          const title = words(note.title);
          const text = note.text && words(note.text);
          return (
            <li key={i} aria-current={current === i ? 'true' : undefined}>
              <h3 lang={title.lang}>
                <button type="button" className="link" onClick={() => onShow(i)}>{title.text}</button>
              </h3>
              {text && <div className="prose" lang={text.lang} dangerouslySetInnerHTML={{ __html: text.text }} />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
