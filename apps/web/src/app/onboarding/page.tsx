import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Wordmark } from '@/components/shared/logo';
import { AcademicForm } from '@/components/onboarding/academic-form';
import { loadOnboardingData } from '@/features/onboarding/data';
import { requireUser } from '@/lib/auth/session';
import { featureEnabled } from '@/features/flags/service';

export const metadata: Metadata = { title: 'Primeiros passos' };

export default async function OnboardingPage() {
  // Com o cadastro da v2 ligado, o onboarding do MVP não é mais usado.
  if (await featureEnabled('cadastro')) redirect('/comecar');
  const user = await requireUser('/onboarding');
  const data = await loadOnboardingData(user.id);
  if (data.profile?.onboardingCompletedAt) redirect('/app');
  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <Wordmark />
      <main id="conteudo" className="mt-8 grid gap-6">
        <div className="grid gap-1">
          <h1 className="text-3xl font-bold">
            Oi, {user.name.split(' ')[0]}. Vamos montar seu estudo.
          </h1>
          <p className="text-muted">3 passos, cerca de 1 minuto.</p>
        </div>
        <AcademicForm data={data} mode="onboarding" />
      </main>
    </div>
  );
}
