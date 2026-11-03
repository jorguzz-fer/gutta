import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminHeader, Checkbox, Flash, tableClass } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Badge, Card, DemoBadge } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { saveCourseAction, saveDisciplineAction } from '@/features/admin/actions';
import { getCourse } from '@/features/admin/service';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Curso' };

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { id } = await params;
  const user = await requireRole(['admin'], `/admin/cursos/${id}`);
  const sp = await searchParams;
  const { course, disciplines } = await getCourse(user, id);
  return (
    <div className="grid gap-6">
      <AdminHeader title={course.name} crumbs={[{ href: '/admin/cursos', label: 'Cursos' }]} />
      <Flash {...sp} />

      <section aria-labelledby="disc" className="grid gap-3">
        <h2 id="disc" className="text-xl">
          Disciplinas
        </h2>
        <Card className="overflow-x-auto p-0 pt-4">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Disciplina</th>
                <th>Semestre</th>
                <th>Assuntos</th>
                <th>Módulos</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {disciplines.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/admin/disciplinas/${d.id}`} className="font-semibold">
                      {d.name}
                    </Link>{' '}
                    {d.isDemo ? <DemoBadge /> : null}
                  </td>
                  <td className="tabular">{d.periodHint ? `${d.periodHint}º` : '—'}</td>
                  <td className="tabular">{d.topics}</td>
                  <td className="tabular">{d.modules}</td>
                  <td>{d.active ? <Badge tone="success">Ativa</Badge> : <Badge>Inativa</Badge>}</td>
                </tr>
              ))}
              {disciplines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted">
                    Nenhuma disciplina ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="nova" className="grid content-start gap-4">
          <h2 id="nova" className="text-xl">
            Nova disciplina
          </h2>
          <form action={saveDisciplineAction} className="grid gap-4">
            <input type="hidden" name="courseId" value={course.id} />
            <Field label="Nome">{(p) => <Input {...p} name="name" required />}</Field>
            <Field label="Semestre sugerido" optional>
              {(p) => <Input {...p} name="periodHint" type="number" min={1} max={16} />}
            </Field>
            <Field label="Descrição" optional>
              {(p) => <Textarea {...p} name="description" maxLength={500} />}
            </Field>
            <Checkbox name="active" label="Ativa" defaultChecked />
            <div>
              <Button type="submit">Criar disciplina</Button>
            </div>
          </form>
        </Card>

        <Card as="section" aria-labelledby="editar" className="grid content-start gap-4">
          <h2 id="editar" className="text-xl">
            Dados do curso
          </h2>
          <form action={saveCourseAction} className="grid gap-4">
            <input type="hidden" name="id" value={course.id} />
            <Field label="Nome">
              {(p) => <Input {...p} name="name" required defaultValue={course.name} />}
            </Field>
            <Field label="Endereço">
              {(p) => <Input {...p} name="slug" defaultValue={course.slug} />}
            </Field>
            <Checkbox
              name="active"
              label="Ativo (aparece no cadastro)"
              defaultChecked={course.active}
            />
            <div>
              <Button type="submit" variant="secondary">
                Salvar curso
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
