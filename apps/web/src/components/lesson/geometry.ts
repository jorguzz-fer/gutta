import type { lessonStudy } from '@gutta/contracts';

// Geometria da camada de marcações (ADR 0015). As formas guardam coordenadas de 0 a 1 em
// relação à página; aqui viram pixels do tamanho em que a página está na tela.

export type Shape = lessonStudy.Shape;
export type Pt = [number, number, number];

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Contorno de um traço de caneta com espessura variável pela pressão. Devolve o `d` de um
 * caminho SVG preenchido. Com um ponto só, um círculo.
 */
export function strokeOutline(points: Pt[], width: number, usePressure = true): string {
  const radius = (p: number) => (width / 2) * (usePressure ? 0.4 + 1.2 * p : 1);
  if (points.length === 0) return '';
  if (points.length === 1) {
    const [x, y, p] = points[0]!;
    const r = radius(p);
    return `M${r1(x - r)},${r1(y)}a${r1(r)},${r1(r)} 0 1,0 ${r1(2 * r)},0a${r1(r)},${r1(r)} 0 1,0 ${r1(-2 * r)},0Z`;
  }
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const [x, y, p] = points[i]!;
    const [px, py] = points[Math.max(0, i - 1)]!;
    const [nx, ny] = points[Math.min(points.length - 1, i + 1)]!;
    let dx = nx - px;
    let dy = ny - py;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const r = radius(p);
    left.push(`${r1(x - dy * r)},${r1(y + dx * r)}`);
    right.push(`${r1(x + dy * r)},${r1(y - dx * r)}`);
  }
  const re = r1(radius(points[points.length - 1]![2]));
  const rs = r1(radius(points[0]![2]));
  // Pontas arredondadas: arco do fim do lado esquerdo até o direito, e de volta no começo.
  return (
    `M${left[0]}L${left.join('L')}` +
    `A${re},${re} 0 0,0 ${right[right.length - 1]}` +
    `L${right.reverse().join('L')}` +
    `A${rs},${rs} 0 0,0 ${left[0]}Z`
  );
}

/** Retângulo que contém a forma, em coordenadas da página (0 a 1). */
export function bounds(s: Shape, aspect: number): { x: number; y: number; w: number; h: number } {
  switch (s.kind) {
    case 'pen':
    case 'marker': {
      const xs = s.points.map((p) => p[0]);
      const ys = s.points.map((p) => p[1]);
      const pad = s.width;
      return {
        x: Math.min(...xs) - pad,
        y: Math.min(...ys) - pad * aspect,
        w: Math.max(...xs) - Math.min(...xs) + 2 * pad,
        h: Math.max(...ys) - Math.min(...ys) + 2 * pad * aspect,
      };
    }
    case 'line':
    case 'arrow':
      return {
        x: Math.min(s.x1, s.x2),
        y: Math.min(s.y1, s.y2),
        w: Math.abs(s.x2 - s.x1),
        h: Math.abs(s.y2 - s.y1),
      };
    case 'text':
      return { x: s.x, y: s.y, w: s.size * 0.6 * Math.min(s.text.length, 60), h: s.size * 1.4 };
    default:
      return { x: s.x, y: s.y, w: s.w, h: s.h };
  }
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * A borracha toca a forma? `x` e `y` em pixels; `w` e `h` são o tamanho da página na tela;
 * `tol` é o raio da borracha em pixels. Borracha de objeto: apaga a forma inteira.
 */
export function hits(s: Shape, x: number, y: number, w: number, h: number, tol: number): boolean {
  if (s.kind === 'pen' || s.kind === 'marker') {
    const r = tol + (s.width * w) / 2;
    const pts = s.points;
    if (pts.length === 1) return Math.hypot(pts[0]![0] * w - x, pts[0]![1] * h - y) <= r;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (distToSegment(x, y, a[0] * w, a[1] * h, b[0] * w, b[1] * h) <= r) return true;
    }
    return false;
  }
  if (s.kind === 'line' || s.kind === 'arrow')
    return distToSegment(x, y, s.x1 * w, s.y1 * h, s.x2 * w, s.y2 * h) <= tol + (s.width * w) / 2;
  const b = bounds(s, h / w);
  return (
    x >= b.x * w - tol &&
    x <= (b.x + b.w) * w + tol &&
    y >= b.y * h - tol &&
    y <= (b.y + b.h) * h + tol
  );
}

/** Menos pontos sem mudar o desenho: descarta pontos a menos de `min` pixels do anterior. */
export function thin(points: Pt[], w: number, h: number, min = 1.5): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot((p[0] - last[0]) * w, (p[1] - last[1]) * h) >= min) out.push(p);
  }
  const end = points[points.length - 1];
  if (end && out[out.length - 1] !== end) out.push(end);
  return out;
}

/** Arredonda as coordenadas para 4 casas: menos bytes, precisão de sobra. */
export const q4 = (n: number) => Math.round(n * 10_000) / 10_000;

let counter = 0;
export function shapeId() {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
