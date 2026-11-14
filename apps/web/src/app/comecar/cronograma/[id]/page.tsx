import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ScheduleReview } from '@/components/schedule/schedule-review';
import { Stepper } from '@/components/signup/stepper';
import { getImport } from '@/features/schedule/service';
import { canOpen } from '@/features/signup/steps';
import { loadSignup } from '@/features/signup/service';
import { ApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Conferir cronograma' };

// Conferência do cronograma dentro do cadastro (SPEC v2, DIS-05): as aulas confirmadas já
// aparecem no passo da rotina (ROT-02).
export default async function SignupScheduleReview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/comecar/cronograma/${id}`);
  const data = await loadSignup(user.id);
  if (!canOpen(data.progress, 'disciplinas')) redirect('/comecar');
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const res = await getImport(user.id, id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const dto = res.import;
  return (
    <>
      <Stepper progress={data.progress} current="disciplinas" />
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">Conferir cronograma</h1>
        <p className="text-muted">
          {dto.disciplineName} · {dto.fileName}. A IA leu o arquivo; confira e corrija antes de
          levar para a agenda. Nada muda sem a sua confirmação.
        </p>
      </div>
      <div data-wide>
        <ScheduleReview
          initial={dto}
          backHref="/comecar/disciplinas"
          backLabel="Voltar para as disciplinas"
        />
      </div>
    </>
  );
}
