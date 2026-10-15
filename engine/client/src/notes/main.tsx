import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NotesHelper, type NotesFile } from './NotesHelper';
import type { Site } from '../site';
import '../colours.css';
import '../styles.css';

/** What the build left for this page: the site, notes.md as written, and where to change or make it on GitHub. */
async function load(): Promise<{ site: Site; notes?: NotesFile; notesUrl?: string }> {
  const json = (file: string) => fetch(`./${file}`).then((response) => (response.ok ? response.json() : Promise.reject(new Error(`${file} answered ${response.status}`))));
  // settings.json may be from a site built before there was a notes helper: the form then starts empty.
  const [site, { notes, notesUrl }] = await Promise.all([json('site.json'), json('settings.json').catch(() => ({}))]);
  return { site, notes, notesUrl };
}

const root = createRoot(document.getElementById('root')!);
load().then(
  ({ site, notes, notesUrl }) => {
    document.title = `Notes: ${site.title[site.language] ?? Object.values(site.title)[0]}`;
    root.render(
      <StrictMode>
        <NotesHelper site={site} source={notes} editUrl={notesUrl} />
      </StrictMode>,
    );
  },
  () => root.render(<p className="load-error">This page could not load the details of its picture (site.json).</p>),
);
