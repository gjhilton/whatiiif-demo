// The notes helper: a form for writing content/notes.md, the notes on the picture and the tour through them. Each
// note's part of the picture is marked on the picture itself, by the view on screen or by drawing round it. It saves
// nothing itself: the owner pastes what it writes into the file on GitHub, as with the settings helper.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { parseNotes, readNotesSource, writeNotesSource } from '../../../lib/notes.js';
import type { Region } from '../address';
import { htmlLang } from '../language';
import type { Site } from '../site';
import { openPicture, type Picture } from './picture';

/** notes.md as written, and the translations that must be kept in step with it, from settings.json. */
export interface NotesFile {
  file: string;
  text: string;
  translations: string[];
}

/** A note being written; `key` stays with it as notes are added, moved and removed. */
interface Draft {
  key: number;
  title: string;
  region?: Region;
  text: string;
}

let keys = 0;
const draft = (note: Omit<Draft, 'key'>): Draft => ({ ...note, key: keys++ });
const pixels = (n: number) => n.toLocaleString('en-GB');
const describe = ({ x, y, w, h }: Region) => `${pixels(w)} × ${pixels(h)} pixels, ${pixels(x)} across and ${pixels(y)} down`;

/** What the build would say is wrong with the notes, in the helper's own terms where it can; undefined if nothing. */
function problemWith(items: Draft[], written: string, file: string, site: Site): string | undefined {
  if (items.length === 0) return `There are no notes. To have none, delete ${file} instead.`;
  for (const [i, { title, region }] of items.entries()) {
    if (!title.trim()) return `Note ${i + 1} needs a title.`;
    if (!region) return `Note ${i + 1} needs a part of the picture: show it on screen and choose “Use the part in view”, or “Draw it”.`;
    if (region.x + region.w > site.width || region.y + region.h > site.height) return `Note ${i + 1}’s part runs off the picture: mark it again.`;
  }
  if (readNotesSource(written).items.length !== items.length) {
    return 'The text of a note has a heading made with ##, which would start a note of its own: use ### for a heading within a note.';
  }
  try {
    parseNotes(written, file, { linked: true });
  } catch (error) {
    return (error as Error).message;
  }
  return undefined;
}

export function NotesHelper({ site, source, editUrl }: { site: Site; source?: NotesFile; editUrl?: string }) {
  const file = source?.file ?? 'notes.md';
  const [intro, setIntro] = useState(() => (source ? readNotesSource(source.text).intro : ''));
  const [items, setItems] = useState<Draft[]>(() => (source ? readNotesSource(source.text).items.map(draft) : []));
  const [selected, setSelected] = useState<number>(); // a note's key
  const [drawing, setDrawing] = useState<number | 'new'>(); // the key of the note whose part is being drawn
  const [copied, setCopied] = useState(false);
  const lang = htmlLang(site.language);
  const numberOf = (key?: number) => items.findIndex((note) => note.key === key) + 1;

  // The picture, which numbers the notes as the list does: pressing a number chooses that note.
  const host = useRef<HTMLDivElement>(null);
  const picture = useRef<Picture>(undefined);
  const current = useRef(items);
  current.current = items;
  useEffect(() => {
    picture.current = openPicture(host.current!, site, (i) => setSelected(current.current[i]?.key));
    return () => picture.current?.destroy();
  }, [site]);
  const regions = JSON.stringify(items.map(({ region }) => region));
  const index = items.findIndex((note) => note.key === selected);
  useEffect(() => picture.current?.mark(JSON.parse(regions), index < 0 ? undefined : index), [regions, index]);
  // Choosing a note only outlines its part more boldly: the picture moves only when asked to (Show), so the part
  // an owner has just found stays on screen for "Use the part in view" or "Draw it".
  // A note just added has its title typed next.
  const [added, setAdded] = useState<number>();
  useEffect(() => {
    if (added !== undefined) document.getElementById(`note-title-${added}`)?.focus();
  }, [added]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const change = (key: number, fields: Partial<Draft>) => setItems((now) => now.map((note) => (note.key === key ? { ...note, ...fields } : note)));
  const add = (region?: Region) => {
    const note = draft({ title: '', region, text: '' });
    setItems((now) => [...now, note]);
    setSelected(note.key);
    setAdded(note.key);
  };
  const move = (key: number, by: number) =>
    setItems((now) => {
      const [i, next] = [now.findIndex((note) => note.key === key), [...now]];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  const remove = (key: number) => setItems((now) => now.filter((note) => note.key !== key));
  const inView = () => picture.current?.inView();
  /** Scrolls the picture onto the screen, where a note further down the page has taken it off. */
  const bringIntoView = () => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    host.current?.parentElement?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' });
  };
  /** Lets the next drag across the picture mark the part of the note with `key`, or of a new note. */
  const draw = (key: number | 'new') => {
    if (key !== 'new') setSelected(key);
    setDrawing(key);
    bringIntoView();
    picture.current?.draw((region) => {
      setDrawing(undefined);
      if (key === 'new') add(region);
      else change(key, { region });
    });
  };
  const stopDrawing = () => {
    picture.current?.stopDrawing();
    setDrawing(undefined);
  };

  const written = writeNotesSource({ intro, items }, site.pageUrl);
  const problem = problemWith(items, written, file, site);
  const shape = { '--shape': site.width / site.height } as CSSProperties;

  return (
    <div className="settings notes-helper">
      <header className="masthead">
        <div>
          <h1>Notes</h1>
          <p>{site.title[site.language] ?? Object.values(site.title)[0]}</p>
        </div>
      </header>
      <div className="viewer" style={shape} role="region" aria-label="The picture" aria-describedby="picture-hint">
        <div className="viewer-host" ref={host} />
      </div>
      <div className="notes-toolbar">
        <p id="picture-hint" className="hint">
          {drawing === undefined
            ? 'Zoom in on a part of the picture and choose “Use the part in view”, or draw round it.'
            : `Drag across the picture, round the part for ${drawing === 'new' ? 'a new note' : `note ${numberOf(drawing)}`}.`}
        </p>
        {drawing === undefined ? (
          <>
            <button type="button" onClick={() => add(inView())}>Add a note for the part in view</button>
            <button type="button" onClick={() => draw('new')}>Draw a new note’s part</button>
            <button type="button" className="quiet" onClick={() => picture.current?.home()}>Show the whole picture</button>
          </>
        ) : (
          <button type="button" onClick={stopDrawing}>Stop drawing</button>
        )}
      </div>

      <main className="settings-columns">
        <form className="settings-form" onSubmit={(event) => event.preventDefault()}>
          <section>
            <h2>Introduction</h2>
            <label className="field">
              <span className="field-label">What comes before the notes</span>
              <textarea value={intro} lang={lang} rows={3} onChange={(event) => setIntro(event.target.value)} />
              <span className="hint">Optional. Markdown, as in description.md.</span>
            </label>
          </section>

          <section>
            <h2>Notes, in the order of the tour</h2>
            {items.length === 0 && <p className="hint">No notes yet. Add one for the part of the picture on screen, or draw one.</p>}
            <ol className="notes-list">
              {items.map((note, i) => (
                <li key={note.key} aria-current={selected === note.key ? 'true' : undefined} onFocus={() => setSelected(note.key)}>
                  <fieldset>
                    <legend>Note {i + 1}</legend>
                    <label className="field">
                      <span className="field-label">Title</span>
                      <input id={`note-title-${note.key}`} value={note.title} lang={lang} onChange={(event) => change(note.key, { title: event.target.value })} />
                    </label>
                    <div className="field">
                      <span className="field-label">Part of the picture</span>
                      <span className="hint">{note.region ? describe(note.region) : 'None yet.'}</span>
                      <span className="note-buttons">
                        {note.region && (
                          <button type="button" aria-label={`Show note ${i + 1}`} onClick={() => {
                              setSelected(note.key);
                              bringIntoView();
                              picture.current?.show(note.region!);
                            }}>
                            Show
                          </button>
                        )}
                        <button type="button" aria-label={`Use the part in view for note ${i + 1}`} onClick={() => change(note.key, { region: inView() ?? note.region })}>
                          Use the part in view
                        </button>
                        <button type="button" aria-label={`Draw it: note ${i + 1}`} onClick={() => draw(note.key)} disabled={drawing !== undefined}>
                          Draw it
                        </button>
                      </span>
                    </div>
                    <label className="field">
                      <span className="field-label">Text</span>
                      <textarea value={note.text} lang={lang} rows={4} onChange={(event) => change(note.key, { text: event.target.value })} />
                      <span className="hint">Markdown: *italic*, **bold**, [a link](https://…), ### a heading.</span>
                    </label>
                    <span className="note-buttons">
                      <button type="button" className="quiet" aria-label={`Move note ${i + 1} up`} onClick={() => move(note.key, -1)} disabled={i === 0}>
                        Move up
                      </button>
                      <button type="button" className="quiet" aria-label={`Move note ${i + 1} down`} onClick={() => move(note.key, 1)} disabled={i === items.length - 1}>
                        Move down
                      </button>
                      <button type="button" className="quiet" aria-label={`Remove note ${i + 1}`} onClick={() => remove(note.key)}>
                        Remove
                      </button>
                    </span>
                  </fieldset>
                </li>
              ))}
            </ol>
          </section>
        </form>

        <aside className="settings-file">
          <h2>Your {file}</h2>
          {problem ? <p className="problem" role="alert">{problem}</p> : <p className="hint">Ready to use.</p>}
          {source && source.translations.length > 0 && (
            <p className="hint">
              Your notes are also in {source.translations.join(', ')}: give {source.translations.length === 1 ? 'it' : 'each'} the same notes, in the same
              order.
            </p>
          )}
          <textarea readOnly value={written} aria-label={file} rows={16} wrap="off" onFocus={(event) => event.currentTarget.select()} />
          <button type="button" onClick={() => navigator.clipboard.writeText(written).then(() => setCopied(true), () => {})} aria-live="polite">
            {copied ? 'Copied' : 'Copy'}
          </button>
          <ol>
            <li>Copy it.</li>
            {source ? (
              <li>
                {editUrl ? <a href={editUrl}>Open {file} on GitHub</a> : <>Open <code>content/{file}</code> on GitHub</>}, select everything in it, and paste
                over it.
              </li>
            ) : (
              <li>
                {editUrl ? <a href={editUrl}>Make content/notes.md on GitHub</a> : <>Make <code>content/notes.md</code> on GitHub</>} and paste it in.
              </li>
            )}
            <li>Click <b>Commit changes</b>. The site rebuilds itself in a minute or two.</li>
          </ol>
        </aside>
      </main>
    </div>
  );
}
