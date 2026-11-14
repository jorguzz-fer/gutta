'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/*
  Experimento da caneta (plano, item 36; SPEC v2, AUL-04 e AUL-05). Mede o que importa para
  o Acompanhar Aula antes de escolher a biblioteca de desenho: se o aparelho informa pressão,
  quantos pontos chegam por segundo (com e sem os eventos agrupados), o atraso entre o evento
  e a tela, e se a palma da mão é ignorada quando a caneta está em uso.
*/
type Tool = 'pen' | 'marker' | 'eraser';
type Stats = {
  pointerTypes: Record<string, number>;
  pressureSeen: boolean;
  maxPressure: number;
  tiltSeen: boolean;
  events: number;
  coalescedPoints: number;
  latencies: number[];
  ignoredTouches: number;
  started: number | null;
};

const empty = (): Stats => ({
  pointerTypes: {},
  pressureSeen: false,
  maxPressure: 0,
  tiltSeen: false,
  events: 0,
  coalescedPoints: 0,
  latencies: [],
  ignoredTouches: 0,
  started: null,
});

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

export function PenLab() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stats = useRef<Stats>(empty());
  const penActive = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [snapshot, setSnapshot] = useState<Stats & { seconds: number }>({ ...empty(), seconds: 0 });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    const resize = () => {
      const r = c.getBoundingClientRect();
      c.width = Math.round(r.width * ratio);
      c.height = Math.round(r.height * ratio);
      c.getContext('2d')!.scale(ratio, ratio);
    };
    resize();
    window.addEventListener('resize', resize);
    const timer = setInterval(() => {
      const s = stats.current;
      setSnapshot({ ...s, seconds: s.started ? (Date.now() - s.started) / 1000 : 0 });
    }, 500);
    return () => {
      window.removeEventListener('resize', resize);
      clearInterval(timer);
    };
  }, []);

  const draw = (e: PointerEvent) => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const r = c.getBoundingClientRect();
    const s = stats.current;
    // Com a caneta em uso, toques de dedo (palma) são ignorados.
    if (e.pointerType === 'touch' && penActive.current) {
      s.ignoredTouches++;
      return;
    }
    const points = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    s.coalescedPoints += Math.max(points.length, 1);
    s.events++;
    for (const p of points.length ? points : [e]) {
      const x = p.clientX - r.left;
      const y = p.clientY - r.top;
      const pressure = p.pointerType === 'pen' ? p.pressure : 0.5;
      if (p.pointerType === 'pen' && p.pressure > 0 && p.pressure !== 0.5) s.pressureSeen = true;
      s.maxPressure = Math.max(s.maxPressure, p.pressure);
      if (p.tiltX || p.tiltY) s.tiltSeen = true;
      if (last.current) {
        ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = tool === 'marker' ? 'rgba(250, 204, 21, 0.35)' : 'rgb(194, 24, 29)';
        ctx.lineWidth = tool === 'marker' ? 18 : tool === 'eraser' ? 24 : 1 + pressure * 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(last.current.x, last.current.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      last.current = { x, y };
    }
    // Atraso: do instante do evento até o próximo quadro desenhado.
    const stamp = e.timeStamp;
    requestAnimationFrame(() => {
      s.latencies.push(performance.now() - stamp);
      if (s.latencies.length > 2000) s.latencies.shift();
    });
  };

  useEffect(() => {
    const c = canvas.current!;
    const down = (e: PointerEvent) => {
      const s = stats.current;
      s.started ??= Date.now();
      s.pointerTypes[e.pointerType] = (s.pointerTypes[e.pointerType] ?? 0) + 1;
      if (e.pointerType === 'pen') penActive.current = true;
      if (e.pointerType === 'touch' && penActive.current) {
        s.ignoredTouches++;
        return;
      }
      c.setPointerCapture(e.pointerId);
      last.current = null;
      draw(e);
    };
    const move = (e: PointerEvent) => {
      if (!c.hasPointerCapture(e.pointerId)) return;
      e.preventDefault();
      draw(e);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'pen') setTimeout(() => (penActive.current = false), 500);
      last.current = null;
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
    };
    // draw lê a ferramenta atual pelo fechamento; recriar os ouvintes ao trocar basta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  const seconds = snapshot.seconds;
  const report = {
    aparelho: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    tela:
      typeof window !== 'undefined'
        ? `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`
        : '',
    tipos: snapshot.pointerTypes,
    pressao: snapshot.pressureSeen ? `sim (máx. ${snapshot.maxPressure.toFixed(2)})` : 'não',
    inclinacao: snapshot.tiltSeen ? 'sim' : 'não',
    pontosPorEvento: snapshot.events ? +(snapshot.coalescedPoints / snapshot.events).toFixed(2) : 0,
    pontosPorSegundo: seconds ? Math.round(snapshot.coalescedPoints / seconds) : 0,
    atrasoMs: {
      mediana: +percentile(snapshot.latencies, 50).toFixed(1),
      p95: +percentile(snapshot.latencies, 95).toFixed(1),
    },
    toquesIgnorados: snapshot.ignoredTouches,
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Ferramenta">
        {(
          [
            ['pen', 'Caneta'],
            ['marker', 'Marca-texto'],
            ['eraser', 'Borracha'],
          ] as const
        ).map(([k, label]) => (
          <Button
            key={k}
            type="button"
            variant={tool === k ? 'primary' : 'secondary'}
            aria-pressed={tool === k}
            onClick={() => setTool(k)}
          >
            {label}
          </Button>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const c = canvas.current!;
            c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
            stats.current = empty();
            setSnapshot({ ...empty(), seconds: 0 });
          }}
        >
          Limpar e zerar
        </Button>
      </div>
      <canvas
        ref={canvas}
        aria-label="Área de desenho do teste"
        className="h-[60vh] w-full touch-none rounded-[var(--radius)] border border-line bg-white"
      />
      <section aria-label="Resultado" className="grid gap-2">
        <pre className="overflow-x-auto rounded-[var(--radius)] border border-line bg-surface p-3 text-sm">
          {JSON.stringify(report, null, 2)}
        </pre>
        <div>
          <Button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
              setCopied(true);
            }}
          >
            {copied ? 'Copiado' : 'Copiar resultado'}
          </Button>
        </div>
      </section>
    </div>
  );
}
