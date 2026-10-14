import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadSite } from './site';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

loadSite().then(
  (site) =>
    root.render(
      <StrictMode>
        <App site={site} />
      </StrictMode>,
    ),
  () => root.render(<p className="load-error">This page could not load the details of its image (site.json).</p>),
);
