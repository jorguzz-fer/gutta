'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { lessonStudy } from '@gutta/contracts';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { hits, q4, shapeId, thin, type Pt, type Shape } from './geometry';
import type { PDFDocumentProxy } from './pdf';
import { ShapeView } from './shapes';

export type Tool =
  | 'navegar'
  | 'pen'
  | 'marker'
  | 'eraser'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'regiao';
export type Region = z.infer<typeof lessonStudy.Region>;
export type WidthKey = 'fino' | 'medio' | 'grosso';

const WIDTH: Record<WidthKey, number> = { fino: 0.002, medio: 0.004, grosso: 0.008 };
const TEXT_SIZE: Record<WidthKey, number> = { fino: 0.016, medio: 0.022, grosso: 0.03 };

type Props = {
  doc: PDFDocumentProxy | null;
  page: number;
  zoom: number;
  layer: Shape[];
  hidden: boolean;
  tool: Tool;
  color: string;
  width: WidthKey;
  highlight: Region | null;
  label: string;
  onLayer: (next: Shape[]) => void;
  onRegion: (r: Region) => void;
};

/*
  Página do PDF (pdf.js no canvas) com a camada de marcações em SVG por cima (ADR 0015;
  AUL-03 a AUL-06). O traço é desenhado aqui, sem esperar o servidor. Com a caneta em uso,
  o toque do dedo (a palma apoiada) não desenha.
*/
export function SlideCanvas(p: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [avail, setAvail] = useState(0);
  const [aspect, setAspect] = useState(0.75);
  const [rendering, setRendering] = useState(true);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState('');
  const penSeen = useRef(false);
  const live = useRef<{ shape: Shape; start: [number, number]; pointer: number } | null>(null);
  const erasing = useRef<Shape[] | null>(null);
  const frame = useRef<number | null>(null);

  const w = Math.max(240, Math.round(avail * p.zoom));
  const h = Math.round(w * aspect);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Desenha a página no canvas, na resolução da tela.
  useEffect(() => {
    const doc = p.doc;
    const c = canvas.current;
    if (!doc || !c || !avail) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    setRendering(true);
    setFailed(false);
    void (async () => {
      try {
        const pg = await doc.getPage(p.page);
        if (cancelled) return;
        const base = pg.getViewport({ scale: 1 });
        const ratio = base.height / base.width;
        setAspect(ratio);
        const cssW = Math.max(240, Math.round(avail * p.zoom));
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const viewport = pg.getViewport({ scale: (cssW / base.width) * dpr });
        c.width = Math.floor(viewport.width);
        c.height = Math.floor(viewport.height);
        task = pg.render({ canvas: c, viewport });
        await task.promise;
        if (!cancelled) setRendering(false);
      } catch (err) {
        if (!cancelled && (err as { name?: string })?.name !== 'RenderingCancelledException') {
          setFailed(true);
          setRendering(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [p.doc, p.page, p.zoom, avail]);

  const norm = useCallback(
    (e: { clientX: number; clientY: number; pressure: number; pointerType: string }): Pt => {
      const r = svg.current!.getBoundingClientRect();
      return [
        q4((e.clientX - r.left) / r.width),
        q4((e.clientY - r.top) / r.height),
        e.pointerType === 'pen' ? Math.round(e.pressure * 100) / 100 : 0.5,
      ];
    },
    [],
  );

  const paint = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setDraft(live.current ? { ...live.current.shape } : null);
    });
  }, []);

  const eraseAt = (pt: Pt) => {
    const cur = erasing.current;
    if (!cur) return;
    const x = pt[0] * w;
    const y = pt[1] * h;
    const next = cur.filter((s) => !hits(s, x, y, w, h, 10));
    if (next.length !== cur.length) {
      erasing.current = next;
      p.onLayer(next);
    }
  };

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (p.tool === 'navegar' || p.hidden) return;
    if (e.pointerType === 'pen') penSeen.current = true;
    // Palma apoiada enquanto a caneta está em uso.
    if (e.pointerType === 'touch' && penSeen.current) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    const pt = norm(e);
    if (p.tool === 'text') {
      setTextAt({ x: pt[0], y: pt[1] });
      setText('');
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (p.tool === 'eraser') {
      erasing.current = p.layer;
      eraseAt(pt);
      return;
    }
    const base = { id: shapeId(), color: p.color, width: WIDTH[p.width] };
    let shape: Shape;
    if (p.tool === 'pen') shape = { ...base, kind: 'pen', points: [pt] };
    else if (p.tool === 'marker')
      shape = { ...base, kind: 'marker', width: WIDTH[p.width] * 4, points: [pt] };
    else if (p.tool === 'line' || p.tool === 'arrow')
      shape = { ...base, kind: p.tool, x1: pt[0], y1: pt[1], x2: pt[0], y2: pt[1] };
    else
      shape = {
        ...base,
        kind: p.tool === 'ellipse' ? 'ellipse' : 'rect',
        x: pt[0],
        y: pt[1],
        w: 0,
        h: 0,
      };
    live.current = { shape, start: [pt[0], pt[1]], pointer: e.pointerId };
    paint();
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (erasing.current) {
      eraseAt(norm(e));
      return;
    }
    const l = live.current;
    if (!l || l.pointer !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const pts = (events.length ? events : [e.nativeEvent]).map(norm);
    const end = pts[pts.length - 1]!;
    const s = l.shape;
    if (s.kind === 'pen' || s.kind === 'marker') s.points.push(...pts);
    else if (s.kind === 'line' || s.kind === 'arrow') {
      s.x2 = end[0];
      s.y2 = end[1];
    } else if (s.kind === 'rect' || s.kind === 'ellipse') {
      s.x = Math.min(l.start[0], end[0]);
      s.y = Math.min(l.start[1], end[1]);
      s.w = q4(Math.abs(end[0] - l.start[0]));
      s.h = q4(Math.abs(end[1] - l.start[1]));
    }
    paint();
  }

  function onPointerUp() {
    if (erasing.current) {
      erasing.current = null;
      return;
    }
    const l = live.current;
    live.current = null;
    setDraft(null);
    if (!l) return;
    const s = l.shape;
    if (s.kind === 'pen' || s.kind === 'marker') {
      p.onLayer([...p.layer, { ...s, points: thin(s.points, w, h).slice(0, 5000) }]);
      return;
    }
    if (s.kind === 'line' || s.kind === 'arrow') {
      if (Math.hypot((s.x2 - s.x1) * w, (s.y2 - s.y1) * h) < 4) return;
      p.onLayer([...p.layer, s]);
      return;
    }
    if (s.kind === 'rect' || s.kind === 'ellipse') {
      if (s.w * w < 4 || s.h * h < 4) return;
      if (p.tool === 'regiao') p.onRegion({ x: s.x, y: s.y, w: s.w, h: s.h });
      else p.onLayer([...p.layer, s]);
    }
  }

  function placeText(ev: React.FormEvent) {
    ev.preventDefault();
    const t = text.trim();
    if (t && textAt)
      p.onLayer([
        ...p.layer,
        {
          id: shapeId(),
          kind: 'text',
          color: p.color,
          size: TEXT_SIZE[p.width],
          x: textAt.x,
          y: textAt.y,
          text: t.slice(0, 2000),
        },
      ]);
    setTextAt(null);
  }

  const drafting =
    draft && p.tool === 'regiao' && (draft.kind === 'rect' || draft.kind === 'ellipse');

  return (
    <div ref={wrap} className="w-full overflow-auto">
      <div className="relative mx-auto bg-white shadow-sm" style={{ width: w, height: h }}>
        <canvas
          ref={canvas}
          aria-hidden
          className="absolute inset-0 block"
          style={{ width: w, height: h }}
        />
        {rendering ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-neutral-600">
            Carregando o slide…
          </p>
        ) : null}
        {failed ? (
          <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-neutral-700">
            Não deu para mostrar esta página. Tente recarregar.
          </p>
        ) : null}
        <svg
          ref={svg}
          role="img"
          aria-label={p.label}
          width={w}
          height={h}
          className="absolute inset-0"
          style={{
            touchAction: p.tool === 'navegar' ? 'auto' : 'none',
            cursor: p.tool === 'navegar' ? 'default' : p.tool === 'text' ? 'text' : 'crosshair',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {!p.hidden ? p.layer.map((s) => <ShapeView key={s.id} s={s} w={w} h={h} />) : null}
          {draft && !drafting ? <ShapeView s={draft} w={w} h={h} /> : null}
          {drafting ? (
            <rect
              x={draft.x * w}
              y={draft.y * h}
              width={draft.w * w}
              height={draft.h * h}
              fill="rgba(37, 99, 235, 0.08)"
              stroke="#2563eb"
              strokeDasharray="6 4"
            />
          ) : null}
          {p.highlight ? (
            <rect
              x={p.highlight.x * w}
              y={p.highlight.y * h}
              width={p.highlight.w * w}
              height={p.highlight.h * h}
              fill="rgba(250, 204, 21, 0.18)"
              stroke="#b45309"
              strokeWidth={3}
              className="motion-safe:animate-pulse"
            />
          ) : null}
        </svg>
        {textAt ? (
          <form
            onSubmit={placeText}
            className="absolute z-10 grid w-64 gap-2 rounded-[var(--radius)] border border-line bg-surface p-2 text-fg shadow-lg"
            style={{
              left: Math.min(textAt.x * w, Math.max(0, w - 256)),
              top: Math.min(textAt.y * h, Math.max(0, h - 120)),
            }}
          >
            <label htmlFor="texto-no-slide" className="text-sm font-semibold">
              Texto no slide
            </label>
            <textarea
              id="texto-no-slide"
              autoFocus
              rows={2}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="rounded-[var(--radius)] border border-line-strong bg-surface-2 p-2"
            />
            <div className="flex gap-2">
              <Button type="submit">Pôr no slide</Button>
              <Button type="button" variant="ghost" onClick={() => setTextAt(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
