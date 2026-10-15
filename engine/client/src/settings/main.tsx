import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsHelper, type Settings } from './SettingsHelper';
import type { Site } from '../site';
import '../colours.css';
import '../styles.css';

/** What the build left for this page: the settings as written, and where to edit them on GitHub. */
async function load(): Promise<{ settings?: Settings; editUrl?: string; title?: string }> {
  // Either file may be missing, from a site built before there was a settings helper: the form then starts empty.
  const json = <T,>(file: string): Promise<Partial<T>> =>
    fetch(`./${file}`).then((response) => (response.ok ? response.json() : {}), () => ({}));
  const [{ settings, editUrl }, site] = await Promise.all([json<{ settings: Settings; editUrl: string }>('settings.json'), json<Site>('site.json')]);
  const title = site.title && site.language && (site.title[site.language] ?? Object.values(site.title)[0]);
  return { settings, editUrl, title };
}

const root = createRoot(document.getElementById('root')!);
load().then(({ settings, editUrl, title }) => {
  document.title = title ? `Settings: ${title}` : 'Settings';
  root.render(
    <StrictMode>
      <SettingsHelper initial={settings} editUrl={editUrl} title={title} />
    </StrictMode>,
  );
});
