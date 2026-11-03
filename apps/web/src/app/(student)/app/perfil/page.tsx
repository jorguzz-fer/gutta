import type { Metadata } from 'next';
import Link from 'next/link';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { AcademicForm } from '@/components/onboarding/academic-form';
import { LookSwitch } from '@/components/shared/look-switch';
import { ClassesCard } from '@/components/classes/classes-card';
import { listStudentClasses } from '@/features/classes/service';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { removeExam } from '@/features/onboarding/actions';
import { loadOnboardingData } from '@/features/onboarding/data';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Perfil' };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ turma_ok?: string; turma_erro?: string }>;
}) {
  const user = await requireStudent('/app/perfil');
  const sp = await searchParams;
  const data = await loadOnboardingData(user.id);
  const classes = await listStudentClasses(user);
  const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: data.timezone });
  const disciplineName = (id: string) =>
    data.disciplines.find((d) => d.id === id)?.name ?? 'Disciplina';
  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">Perfil</h1>
        <p className="text-muted">{user.email}</p>
      </div>

      <Card>
        <AcademicForm data={data} mode="perfil" />
      </Card>

      <ClassesCard classes={classes} ok={sp.turma_ok} erro={sp.turma_erro} />

      <Card aria-labelledby="provas">
        <h2 id="provas" className="text-xl font-bold">
          Provas cadastradas
        </h2>
        {data.exams.length === 0 ? (
          <p className="mt-2 text-muted">
            Nenhuma. Cadastre no formulário acima, em &quot;Tem prova chegando?&quot;.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {data.exams.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2"
              >
                <span>
                  <strong>{e.title}</strong> · {disciplineName(e.disciplineId)} ·{' '}
                  {fmt.format(e.examAt)}
                </span>
                <form action={removeExam}>
                  <input type="hidden" name="examId" value={e.id} />
                  <Button type="submit" variant="ghost">
                    Remover
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card aria-labelledby="visual">
        <h2 id="visual" className="text-xl font-bold">
          Visual <span className="font-sans text-sm font-normal text-muted">(experimento)</span>
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Estamos testando um visual com vidro fosco. A escolha fica só neste aparelho.
        </p>
        <LookSwitch />
      </Card>

      <Card aria-labelledby="conta">
        <h2 id="conta" className="text-xl font-bold">
          Conta e segurança
        </h2>
        <ul className="mt-3 grid gap-2">
          <li>
            <Link href="/app/privacidade">Privacidade e seus dados</Link>
          </li>
          <li>
            <Link href="/seguranca/dois-fatores">Verificação em duas etapas</Link>
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-3">
          <SignOutButton />
          <SignOutButton everywhere />
        </div>
      </Card>
    </div>
  );
}
