import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DisciplineEditor } from '@/components/disciplines/discipline-editor';
import { ContinueForm } from '@/components/signup/continue-form';
import { Stepper } from '@/components/signup/stepper';
import { listDisciplines } from '@/features/academics/service';
import { canOpen } from '@/features/signup/steps';
import { loadSignup } from '@/features/signup/service';
import { requireUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Disciplinas' };

export default async function DisciplinesStep() {
  const user = await requireUser('/comecar/disciplinas');
  const data = await loadSignup(user.id);
  if (!canOpen(data.progress, 'disciplinas')) redirect('/comecar');
  const { items } = await listDisciplines(user.id);
  return (
    <>
      <Stepper progress={data.progress} current="disciplinas" />
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">Suas disciplinas</h1>
        <p className="text-muted">
          Cadastre as disciplinas deste semestre. Com o cronograma, a Cognuss monta as aulas e as
          provas na sua agenda, sempre com a sua conferência antes.
        </p>
      </div>
      <DisciplineEditor initial={items} />
      <ContinueForm />
      <Link href="/comecar/perfil" className="text-sm">
        Voltar para o perfil acadêmico
      </Link>
    </>
  );
}
