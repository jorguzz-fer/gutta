import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { requireFeature } from '@/features/flags/service';
import { changeGoalAction } from '@/features/space/actions';
import { loadSpace } from '@/features/space/service';
import { MAIN_GOALS } from '@/features/signup/steps';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Alterar objetivo' };

export default async function GoalPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  await requireFeature('meu_espaco');
  const user = await requireStudent('/app/objetivo');
  const sp = await searchParams;
  const space = await loadSpace(user.id);
  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl md:text-4xl">Seu objetivo principal</h1>
        <p className="text-muted">
          Ele orienta o que a Cognuss sugere primeiro. Dá para mudar quando quiser.
        </p>
      </div>
      {sp.erro ? <Alert tone="danger">Escolha uma das opções.</Alert> : null}
      <Card>
        <form action={changeGoalAction} className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="sr-only">Objetivo principal</legend>
            {MAIN_GOALS.map((g) => (
              <label key={g.value} className="flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  name="mainGoal"
                  value={g.value}
                  defaultChecked={space.profile.mainGoal === g.value}
                  required
                  className="size-5"
                />
                {g.label}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit">Salvar objetivo</Button>
            <Link href="/app">Voltar para o Meu Espaço</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
