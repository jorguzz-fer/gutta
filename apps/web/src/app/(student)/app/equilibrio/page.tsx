import { addDays } from '@gutta/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { WeekBoard } from '@/components/planning/week-board';
import { currentDisciplines } from '@/features/academics/service';
import { featureEnabled, requireFeature } from '@/features/flags/service';
import { getWeek } from '@/features/planning/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Equilíbrio' };

const SHORT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});
const at = (d: string) => new Date(`${d}T12:00:00Z`);

// Equilíbrio (SPEC v2, 5.4): planejamento da semana. Organizar o estudo sem preencher todos os
// horários; o aluno decide o que entra na agenda (R10).
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  await requireFeature('equilibrio');
  const user = await requireStudent('/app/equilibrio');
  const { semana } = await searchParams;
  const valid = semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? semana : undefined;
  const [week, disciplines, rotina] = await Promise.all([
    getWeek(user.id, valid),
    currentDisciplines(user.id),
    featureEnabled('rotina'),
  ]);
  const last = week.days[6]!;
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl md:text-4xl">Equilíbrio</h1>
        <p className="text-muted">
          Sugestões de estudo nos horários que você autorizou, com tempo livre de propósito.
        </p>
      </div>
      <nav aria-label="Semana" className="flex flex-wrap items-center gap-2">
        <Link
          href={`/app/equilibrio?semana=${addDays(week.weekStart, -7)}`}
          aria-label="Semana anterior"
          className="grid size-11 place-items-center rounded-[var(--radius)] border border-line"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <p className="font-semibold">
          Semana de {SHORT.format(at(week.weekStart))} a {SHORT.format(at(last))}
        </p>
        <Link
          href={`/app/equilibrio?semana=${addDays(week.weekStart, 7)}`}
          aria-label="Próxima semana"
          className="grid size-11 place-items-center rounded-[var(--radius)] border border-line"
        >
          <ChevronRight className="size-5" aria-hidden />
        </Link>
        {week.days.includes(week.today) ? null : (
          <Link href="/app/equilibrio" className="text-sm">
            Esta semana
          </Link>
        )}
      </nav>
      <WeekBoard
        week={week}
        disciplines={disciplines.map((d) => ({ id: d.id, name: d.name }))}
        rotina={rotina}
      />
    </div>
  );
}
