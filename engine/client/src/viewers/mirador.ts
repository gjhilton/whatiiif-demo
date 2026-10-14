import Mirador from 'mirador';
import type { ViewerAdapter } from './types';
import type { Region } from '../address';
import { pageColour } from '../colours';

interface ViewerState {
  x: number;
  y: number;
  zoom: number;
}

interface MiradorInstance {
  unmount?: () => void;
  store: {
    getState(): { viewers: Record<string, ViewerState | undefined> };
    subscribe(listener: () => void): () => void;
    dispatch(action: unknown): void;
  };
}

const WINDOW = 'whatiiif';

// Mirador keeps a window's view as the centre of the screen, in image pixels, and OpenSeadragon's zoom, which is
// one over the width of image on screen. `aspect` is the pane's width over its height.
const toView = (r: Region, aspect: number): ViewerState => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, zoom: 1 / Math.max(r.w, r.h * aspect) });
const toRegion = ({ x, y, zoom }: ViewerState, aspect: number): Region => {
  const w = 1 / zoom;
  const h = w / aspect;
  return { x: x - w / 2, y: y - h / 2, w, h };
};

const adapter: ViewerAdapter = {
  mount(el, site, { language, region, onRegionChange }) {
    el.id = 'mirador-root';
    const aspect = () => el.clientWidth / el.clientHeight;

    const instance = Mirador.viewer({
      id: el.id,
      language, // Mirador's own interface, and which language of the manifest's labels to show
      windows: [
        {
          id: WINDOW,
          manifestId: site.manifestUrl,
          maximized: true, // fill the pane; there is only ever one window
        },
      ],
      window: { allowClose: false, allowMaximize: false, sideBarOpen: false },
      workspace: { isWorkspaceAddVisible: false },
      workspaceControlPanel: { enabled: false },
      // The page's colours in place of Mirador's blue and grey.
      theme: {
        palette: {
          primary: { main: pageColour('--ink') },
          secondary: { main: pageColour('--ink') },
          error: { main: pageColour('--error') },
          shades: { dark: pageColour('--viewer') },
        },
      },
    }) as MiradorInstance;

    // Mirador opens on the whole picture and reports that view first (it overwrites a window's initialViewerConfig),
    // so a shared view is applied after that, in two steps: Mirador zooms around where the centre is on screen at
    // the time, so panning and zooming at once would land off target.
    const shared = region && toView(region, aspect());
    const steps: Partial<ViewerState>[] = shared ? [{ x: shared.x, y: shared.y }, { zoom: shared.zoom }] : [];
    let seen: ViewerState | undefined;
    let asking = false; // the state changes our own requests make are not reports of where Mirador is
    const ask = (step: Partial<ViewerState>) => {
      asking = true;
      instance.store.dispatch(Mirador.actions.updateViewport(WINDOW, step as ViewerState));
      asking = false;
    };

    const unsubscribe = instance.store.subscribe(() => {
      const view = instance.store.getState().viewers[WINDOW];
      if (!view || view === seen || view.zoom === undefined) return;
      seen = view;
      if (asking) return;
      let step = steps.shift();
      if (step && 'x' in step && Math.abs(view.x - step.x!) < 1 && Math.abs(view.y - step.y!) < 1) step = steps.shift(); // already there
      if (step) return ask(step);
      onRegionChange(toRegion(view, aspect()));
    });

    return () => {
      unsubscribe();
      instance.unmount?.();
    };
  },
};

export default adapter;
