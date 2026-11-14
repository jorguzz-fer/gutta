import type { Metadata } from 'next';
import { AdminHeader } from '@/components/admin/ui';
import { requireRole } from '@/lib/auth/session';
import {
  CATEGORY_COLORS,
  categoryClasses,
  EVENT_TYPE_COLOR,
  type CategoryColor,
} from '@/styles/categories';

export const metadata: Metadata = { title: 'Paleta de categorias' };

// Prévia da paleta (plano, item 37): as cores de categoria aplicadas a uma semana de exemplo,
// no tema escuro e vermelho do app (D03). Troque o tema no topo para ver o claro.
const WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
const SAMPLE: {
  day: number;
  label: string;
  detail: string;
  color: CategoryColor;
  protectedSlot?: boolean;
}[] = [
  { day: 0, label: 'Aula · Disciplina A', detail: '08:00 às 10:00', color: 6 },
  { day: 0, label: 'Estudo', detail: '19:00 às 19:30', color: EVENT_TYPE_COLOR.estudo },
  { day: 1, label: 'Aula · Disciplina B', detail: '08:00 às 12:00', color: 2 },
  { day: 1, label: 'Academia', detail: '19:00 às 20:00', color: EVENT_TYPE_COLOR.pessoal },
  { day: 2, label: 'Prova · Disciplina A', detail: '09:00', color: EVENT_TYPE_COLOR.prova },
  { day: 2, label: 'Revisão', detail: '21:00 às 21:30', color: EVENT_TYPE_COLOR.revisao },
  { day: 3, label: 'Entrega · Disciplina C', detail: 'até 23:59', color: EVENT_TYPE_COLOR.entrega },
  { day: 4, label: 'Lazer', detail: '18:00 às 22:00', color: EVENT_TYPE_COLOR.lazer },
];

export default async function PalettePage() {
  await requireRole(['admin'], '/admin/lab/paleta');
  return (
    <div className="grid gap-6">
      <AdminHeader
        title="Paleta de categorias"
        lead="Cores das disciplinas e dos tipos de evento na grade e no calendário. Todas passam no contraste AA nos dois temas (teste automático em styles/categories.test.ts). A cor nunca vai sozinha: cada bloco leva o nome."
      />
      <section aria-labelledby="cores" className="grid gap-3">
        <h2 id="cores" className="text-lg">
          Cores para disciplinas
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CATEGORY_COLORS.map((c) => (
            <li
              key={c.id}
              className={`rounded-[var(--radius)] border-l-4 px-3 py-2 ${categoryClasses(c.id)}`}
            >
              <span className="font-semibold">{c.name}</span>
              <span className="block text-sm">Fisiopatologia · 08:00</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="semana" className="grid gap-3">
        <h2 id="semana" className="text-lg">
          Semana de exemplo
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          {WEEK.map((d, i) => (
            <div
              key={d}
              className="grid content-start gap-2 rounded-[var(--radius)] border border-line bg-surface p-2"
            >
              <h3 className="text-xs font-semibold tracking-widest text-muted uppercase">{d}</h3>
              {SAMPLE.filter((s) => s.day === i).map((s) => (
                <div
                  key={s.label}
                  className={`rounded-[var(--radius)] border-l-4 px-2 py-1.5 text-sm ${categoryClasses(s.color)}`}
                >
                  <span className="block font-semibold">{s.label}</span>
                  <span className="block">{s.detail}</span>
                </div>
              ))}
              <div className="rounded-[var(--radius)] border border-dashed border-line-strong bg-surface-2 px-2 py-1.5 text-sm text-muted">
                <span className="block font-semibold">Sono · protegido</span>
                <span className="block">23:00 às 07:00</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
