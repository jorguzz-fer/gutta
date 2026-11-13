import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProfileForm } from '@/components/signup/profile-form';
import { Stepper } from '@/components/signup/stepper';
import { canOpen } from '@/features/signup/steps';
import { loadSignup } from '@/features/signup/service';
import { requireUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Perfil acadêmico' };

export default async function ProfileStep() {
  const user = await requireUser('/comecar/perfil');
  const data = await loadSignup(user.id);
  if (!canOpen(data.progress, 'perfil')) redirect('/comecar');
  return (
    <>
      <Stepper progress={data.progress} current="perfil" />
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">Seu curso</h1>
        <p className="text-muted">
          Isso ajuda a Cognuss a sugerir o que faz sentido para o seu semestre.
        </p>
      </div>
      <ProfileForm
        courses={data.courses}
        institutions={data.institutions}
        initial={data.profile ?? null}
      />
      <Link href="/comecar/dados" className="text-sm">
        Voltar para os dados pessoais
      </Link>
    </>
  );
}
