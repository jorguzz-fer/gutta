import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RoutineEditor } from '@/components/routine/routine-editor';
import { ContinueForm } from '@/components/signup/continue-form';
import { Stepper } from '@/components/signup/stepper';
import { getRoutine } from '@/features/routine/service';
import { canOpen } from '@/features/signup/steps';
import { loadSignup } from '@/features/signup/service';
import { requireUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Minha rotina' };

// Passo "Minha rotina" do cadastro (SPEC v2, CAD-05 e ROT). Dá para seguir sem cumprir a meta.
export default async function RoutineStep() {
  const user = await requireUser('/comecar/rotina');
  const data = await loadSignup(user.id);
  if (!canOpen(data.progress, 'rotina')) redirect('/comecar');
  const { routine } = await getRoutine(user.id);
  return (
    <>
      <Stepper progress={data.progress} current="rotina" />
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">Sua rotina semanal</h1>
        <p className="text-muted">
          As aulas do cronograma já aparecem na grade. Marque os horários de estudo e as atividades
          que você quer manter, como sono, refeições e academia: a Cognuss nunca usa esses horários
          para estudo. Dá para mudar depois, quando quiser.
        </p>
      </div>
      <div data-wide>
        <RoutineEditor initial={routine} />
      </div>
      <ContinueForm step="rotina" label="Concluir cadastro" />
      <Link href="/comecar/disciplinas" className="text-sm">
        Voltar para as disciplinas
      </Link>
    </>
  );
}
