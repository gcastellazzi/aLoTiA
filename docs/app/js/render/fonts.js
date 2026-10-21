/** Shared typography for canvas figures and their exports. */
let scale = 1;
let family = 'Helvetica, Arial, sans-serif';
export function setFigureFont(sizePercent, fontFamily) {
  scale = Math.max(0.75, Math.min(1.8, Number(sizePercent) / 100 || 1));
  family = fontFamily;
}
export function figureFont(font) {
  return font.replace(/([\d.]+)px\s+.+$/, (_, size) => `${Number(size) * scale}px ${family}`);
}
