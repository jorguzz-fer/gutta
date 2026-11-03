import type { Metadata } from 'next';
import Link from 'next/link';
import { Flash } from '@/components/admin/ui';
import { Cover } from '@/components/shared/cover';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { createClassAction } from '@/features/classes/actions';
import { listTeacherClasses, teacherDisciplines } from '@/features/classes/service';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Painel do professor' };

export default async function TeacherHome({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await requireRole(['teacher', 'admin'], '/professor');
  const sp = await searchParams;
  const [classes, disciplines] = [await listTeacherClasses(user), await teacherDisciplines(user)];
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-4xl md:text-5xl">Suas turmas</h1>
        <p className="max-w-[65ch] text-muted">
          Crie uma turma, passe o código para os alunos e acompanhe o desempenho de quem entrar.
          Você vê só o que cada aluno fez depois de entrar, e ele pode sair quando quiser.
        </p>
      </div>
      <Flash {...sp} />

      {classes.length === 0 ? (
        <Card>
          <p className="text-muted">Nenhuma turma ainda. Crie a primeira abaixo.</p>
        </Card>
      ) : (
        <ul className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <li key={c.id} className="group relative">
              <Cover
                slug={c.id}
                eyebrow={c.disciplineName ?? 'Turma'}
                title={
                  <Link
                    href={`/professor/turmas/${c.id}`}
                    className="text-cover-fg no-underline after:absolute after:inset-0 group-hover:underline"
                  >
                    {c.name}
                  </Link>
                }
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                <span>
                  {c.members} {c.members === 1 ? 'aluno' : 'alunos'} · código{' '}
                  <span className="font-semibold tracking-widest text-fg">{c.joinCode}</span>
                </span>
                {!c.active ? <Badge>Encerrada</Badge> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Card as="section" aria-labelledby="nova" className="grid gap-4">
        <h2 id="nova" className="text-xl">
          Nova turma
        </h2>
        <form
          action={createClassAction}
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <Field label="Nome da turma">
            {(p) => (
              <Input {...p} name="name" required placeholder="Fisiopatologia · 4º A · 2027.1" />
            )}
          </Field>
          <Field label="Disciplina" optional>
            {(p) => (
              <Select {...p} name="disciplineId" defaultValue="">
                <option value="">Todas</option>
                {disciplines.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.courseName})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button type="submit">Criar turma</Button>
        </form>
      </Card>
    </div>
  );
}
