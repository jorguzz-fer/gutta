import type { Metadata } from 'next';
import { RoutineEditor } from '@/components/routine/routine-editor';
import { requireFeature } from '@/features/flags/service';
import { getRoutine } from '@/features/routine/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Rotina semanal' };

// Rotina semanal, editável a qualquer momento (SPEC v2, ROT-17).
export default async function RoutinePage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  await requireFeature('rotina');
  const user = await requireStudent('/app/rotina');
  const { semana } = await searchParams;
  const week = semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? semana : undefined;
  const { routine } = await getRoutine(user.id, week);
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl md:text-4xl">Rotina semanal</h1>
        <p className="text-muted">
          Quando você estuda, quando tem aula e o que é só seu. Só os blocos de estudo entram no
          planejamento.
        </p>
      </div>
      <RoutineEditor initial={routine} />
    </div>
  );
}
