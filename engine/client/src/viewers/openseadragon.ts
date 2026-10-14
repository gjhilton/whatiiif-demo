import OpenSeadragon from 'openseadragon';
import type { ViewerAdapter } from './types';
import { pageColour } from '../colours';

const adapter: ViewerAdapter = {
  mount(el, site, { region, onRegionChange }) {
    const viewer = OpenSeadragon({
      element: el,
      prefixUrl: `${import.meta.env.BASE_URL}osd-images/`,
      tileSources: site.infoUrl,
      showNavigator: true,
      navigatorPosition: 'BOTTOM_RIGHT',
      // The page's colours in place of the overview map's black, grey and red.
      navigatorBackground: pageColour('--viewer'),
      navigatorBorderColor: pageColour('--ink'),
      navigatorDisplayRegionColor: pageColour('--ink'),
      gestureSettingsMouse: { clickToZoom: false },
    });
    viewer.addOnceHandler('open', () => {
      const image = viewer.world.getItemAt(0);
      if (region) viewer.viewport.fitBounds(image.imageToViewportRectangle(region.x, region.y, region.w, region.h), true);
      viewer.addHandler('animation-finish', () => {
        const { x, y, width, height } = image.viewportToImageRectangle(viewer.viewport.getBounds(true));
        onRegionChange({ x, y, w: width, h: height });
      });
    });
    return () => viewer.destroy();
  },
};

export default adapter;
