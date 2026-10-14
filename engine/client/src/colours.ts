/**
 * A colour from colours.css as the browser resolves it, rgb(...), for the viewers, which take colours as options
 * rather than from the page's CSS (and Mirador cannot read names like "black").
 */
export function pageColour(name: '--paper' | '--ink' | '--error' | '--viewer'): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  document.body.append(probe);
  const { color } = getComputedStyle(probe);
  probe.remove();
  return color;
}
