import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminHeader, Checkbox, Flash, tableClass } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Badge, Card, DemoBadge } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { saveCourseAction } from '@/features/admin/actions';
import { listCourses } from '@/features/admin/service';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Cursos' };

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await requireRole(['admin'], '/admin/cursos');
  const sp = await searchParams;
  const courses = await listCourses(user);
  return (
    <div className="grid gap-6">
      <AdminHeader
        title="Cursos"
        lead="Cada curso tem disciplinas, assuntos e módulos. Desativar esconde o curso do cadastro de alunos novos sem apagar nada."
      />
      <Flash {...sp} />
      <Card className="overflow-x-auto p-0 pt-4">
        <table className={tableClass}>
          <thead>
            <tr>
              <th>Curso</th>
              <th>Disciplinas</th>
              <th>Alunos</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/admin/cursos/${c.id}`} className="font-semibold">
                    {c.name}
                  </Link>{' '}
                  {c.isDemo ? <DemoBadge /> : null}
                  <div className="text-xs text-muted">/{c.slug}</div>
                </td>
                <td className="tabular">{c.disciplines}</td>
                <td className="tabular">{c.students}</td>
                <td>{c.active ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge>}</td>
              </tr>
            ))}
            {courses.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-muted">
                  Nenhum curso ainda. Crie o primeiro abaixo.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <Card as="section" aria-labelledby="novo" className="grid gap-4">
        <h2 id="novo" className="text-xl">
          Novo curso
        </h2>
        <form action={saveCourseAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome">
            {(p) => <Input {...p} name="name" required placeholder="Medicina" />}
          </Field>
          <Field label="Endereço" optional hint="Gerado do nome se ficar vazio.">
            {(p) => <Input {...p} name="slug" placeholder="medicina" />}
          </Field>
          <Checkbox name="active" label="Ativo (aparece no cadastro)" defaultChecked />
          <div className="sm:col-span-2">
            <Button type="submit">Criar curso</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
