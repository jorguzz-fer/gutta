import type { Metadata } from 'next';
import { PersonalForm } from '@/components/signup/personal-form';
import { Stepper } from '@/components/signup/stepper';
import { loadSignup } from '@/features/signup/service';
import { requireUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Seus dados' };

export default async function PersonalStep() {
  const user = await requireUser('/comecar/dados');
  const data = await loadSignup(user.id);
  return (
    <>
      <Stepper progress={data.progress} current="dados" />
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">Vamos configurar seu perfil</h1>
        <p className="text-muted">Primeiro, seus dados. Você pode voltar e mudar tudo depois.</p>
      </div>
      <PersonalForm initial={data.personal} needsTerms={data.needsTerms} />
    </>
  );
}
