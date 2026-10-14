type Colour = '--paper' | '--ink' | '--error' | '--viewer';

/**
 * A colour from colours.css (or the owner's own, from whatiiif.toml) as rgb(...), for the viewers, which take
 * colours as options rather than from the page's CSS. Mirador reads neither names like "black" nor newer forms
 * like oklch(), so the browser draws the colour and the pixel it draws is read back.
 */
export function pageColour(name: Colour): string {
  const [r, g, b, a] = pixel(name);
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

/** Whether the page is light on dark: in dark mode, or because its owner chose dark colours. */
export function darkPage(): boolean {
  const [r, g, b] = pixel('--paper');
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

function pixel(name: Colour): Uint8ClampedArray {
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  document.body.append(probe);
  const { color } = getComputedStyle(probe);
  probe.remove();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  return context.getImageData(0, 0, 1, 1).data;
}
