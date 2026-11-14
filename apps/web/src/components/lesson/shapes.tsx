'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import { strokeOutline, type Pt, type Shape } from './geometry';

// Formas da camada de marcações em SVG (ADR 0015). Coordenadas guardadas de 0 a 1; aqui, em
// pixels do tamanho da página na tela. Texto entra como nó de texto, nunca como HTML.

function ImageShape({
  fileId,
  x,
  y,
  w,
  h,
}: {
  fileId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (tries: number) =>
      api<{ url: string }>(`/files/${fileId}/url?variant=original`)
        .then((r) => alive && setSrc(r.url))
        .catch(() => {
          // Ainda na verificação do antivírus: tenta de novo daqui a pouco.
          if (alive && tries < 20) timer = setTimeout(() => load(tries + 1), 3000);
        });
    void load(0);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [fileId]);
  if (!src)
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill="none" stroke="#6b7280" strokeDasharray="6 4" />
        <text x={x + 8} y={y + 20} fontSize={13} fill="#6b7280">
          Imagem sendo verificada…
        </text>
      </g>
    );
  return <image href={src} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid meet" />;
}

export function ShapeView({ s, w, h }: { s: Shape; w: number; h: number }) {
  switch (s.kind) {
    case 'pen': {
      const pts = s.points.map(([x, y, p]): Pt => [x * w, y * h, p]);
      return <path d={strokeOutline(pts, s.width * w)} fill={s.color} />;
    }
    case 'marker': {
      const pts = s.points.map(([x, y]): Pt => [x * w, y * h, 0.5]);
      return (
        <path
          d={strokeOutline(pts, s.width * w, false)}
          fill={s.color}
          opacity={0.35}
          style={{ mixBlendMode: 'multiply' }}
        />
      );
    }
    case 'line':
    case 'arrow': {
      const x1 = s.x1 * w;
      const y1 = s.y1 * h;
      const x2 = s.x2 * w;
      const y2 = s.y2 * h;
      const sw = Math.max(1, s.width * w);
      let head = null;
      if (s.kind === 'arrow') {
        const a = Math.atan2(y2 - y1, x2 - x1);
        const len = Math.max(10, sw * 4);
        const p = (d: number) => `${x2 - len * Math.cos(a + d)},${y2 - len * Math.sin(a + d)}`;
        head = <polygon points={`${x2},${y2} ${p(0.45)} ${p(-0.45)}`} fill={s.color} />;
      }
      return (
        <g>
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={s.color}
            strokeWidth={sw}
            strokeLinecap="round"
          />
          {head}
        </g>
      );
    }
    case 'rect':
      return (
        <rect
          x={s.x * w}
          y={s.y * h}
          width={s.w * w}
          height={s.h * h}
          fill="none"
          stroke={s.color}
          strokeWidth={Math.max(1, s.width * w)}
        />
      );
    case 'ellipse':
      return (
        <ellipse
          cx={(s.x + s.w / 2) * w}
          cy={(s.y + s.h / 2) * h}
          rx={(s.w / 2) * w}
          ry={(s.h / 2) * h}
          fill="none"
          stroke={s.color}
          strokeWidth={Math.max(1, s.width * w)}
        />
      );
    case 'text': {
      const size = s.size * w;
      return (
        <text
          x={s.x * w}
          y={s.y * h}
          fontSize={size}
          fill={s.color}
          dominantBaseline="hanging"
          style={{ fontFamily: 'inherit' }}
        >
          {s.text.split('\n').map((line, i) => (
            <tspan key={i} x={s.x * w} dy={i === 0 ? 0 : size * 1.25}>
              {line}
            </tspan>
          ))}
        </text>
      );
    }
    case 'image':
      return <ImageShape fileId={s.fileId} x={s.x * w} y={s.y * h} w={s.w * w} h={s.h * h} />;
  }
}
