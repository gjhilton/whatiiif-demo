import type { ViewerEntry } from './types';
import type { ViewerId } from '../site';

/** To add a viewer: write an adapter next to these and register it here. */
export const viewers: Record<ViewerId, ViewerEntry> = {
  openseadragon: { label: 'OpenSeadragon', load: () => import('./openseadragon').then((m) => m.default) },
  mirador: { label: 'Mirador', localised: true, load: () => import('./mirador').then((m) => m.default) },
};
