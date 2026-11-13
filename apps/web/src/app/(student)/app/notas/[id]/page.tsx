import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GradesBoard } from '@/components/grades/grades-board';
import { requireFeature } from '@/features/flags/service';
import { getGrades } from '@/features/grades/service';
import { ApiError } from '@/lib/api';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Notas da disciplina' };

// Notas de uma disciplina (SPEC v2, 5.13; telas T22 e T23).
export default async function DisciplineGradesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFeature('notas');
  const { id } = await params;
  const user = await requireStudent(`/app/notas/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { grades } = await getGrades(user.id, id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl md:text-4xl">Notas: {grades.disciplineName}</h1>
        <p className="text-muted">Acompanhamento pessoal do semestre.</p>
      </div>
      <GradesBoard initial={grades} />
    </div>
  );
}
