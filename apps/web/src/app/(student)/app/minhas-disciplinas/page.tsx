import type { Metadata } from 'next';
import { DisciplineEditor } from '@/components/disciplines/discipline-editor';
import { listDisciplines } from '@/features/academics/service';
import { requireFeature } from '@/features/flags/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Minhas disciplinas' };

// Gerenciar disciplinas do semestre (SPEC v2, DIS-01 a DIS-03 e CAD-08).
export default async function MyDisciplinesPage() {
  await requireFeature('disciplinas');
  const user = await requireStudent('/app/minhas-disciplinas');
  const { items } = await listDisciplines(user.id);
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl md:text-4xl">Minhas disciplinas</h1>
        <p className="text-muted">
          Disciplinas do semestre atual, com docentes, cronograma e plano de ensino.
        </p>
      </div>
      <DisciplineEditor initial={items} />
    </div>
  );
}
