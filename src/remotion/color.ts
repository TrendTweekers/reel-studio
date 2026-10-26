// Tiny colour helpers (CSS hex / rgb only; anything else counts as light).
export const CREAM = '#F5EFE6';
export const INK = '#141210';

const parse = (c: string): [number, number, number] | null => {
  const s = c.trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((x) => x + x).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = s.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const named: Record<string, [number, number, number]> = { black: [0, 0, 0], white: [255, 255, 255] };
  return named[s.toLowerCase()] ?? null;
};

export const luminance = (c: string) => {
  const p = parse(c);
  if (!p) return 1;
  const [r, g, b] = p.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const isDark = (c: string) => luminance(c) < 0.25;

export const withAlpha = (c: string, a: number) => {
  const p = parse(c);
  return p ? `rgba(${p[0]},${p[1]},${p[2]},${a})` : c;
};
