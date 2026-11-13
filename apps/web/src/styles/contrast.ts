// Contraste WCAG entre cores em oklch(), sem depender do navegador. Usado no teste da paleta
// de categorias (tokens.css) e na página de prévia.

export function parseOklch(value: string): [number, number, number] {
  const m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/.exec(value);
  if (!m) throw new Error(`cor fora do formato oklch: ${value}`);
  const l = Number(m[1]) / (m[2] ? 100 : 1);
  return [l, Number(m[3]), Number(m[4])];
}

/** Luminância relativa (WCAG) de uma cor oklch, convertida para sRGB linear. */
export function luminance([L, C, h]: [number, number, number]): number {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

export function contrast(fg: string, bg: string): number {
  const a = luminance(parseOklch(fg));
  const b = luminance(parseOklch(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
