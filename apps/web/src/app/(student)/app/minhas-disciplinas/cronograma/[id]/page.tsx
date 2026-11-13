import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ScheduleReview } from '@/components/schedule/schedule-review';
import { getImport } from '@/features/schedule/service';
import { requireStudent } from '@/lib/auth/session';
import { ApiError } from '@/lib/api';

export const metadata: Metadata = { title: 'Conferir cronograma' };

// Conferência do cronograma lido pela IA (SPEC v2, DIS-05 e DIS-07).
export default async function ScheduleReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStudent(`/app/minhas-disciplinas/cronograma/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getImport(user.id, id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const dto = data.import;
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl md:text-4xl">Conferir cronograma</h1>
        <p className="text-muted">
          {dto.disciplineName} · {dto.fileName}. A IA leu o arquivo; confira e corrija antes de
          levar para a agenda. Nada muda sem a sua confirmação.
        </p>
      </div>
      <ScheduleReview initial={dto} />
    </div>
  );
}
