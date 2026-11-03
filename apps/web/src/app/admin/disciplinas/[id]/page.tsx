import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminHeader, Checkbox, Flash, StatusBadge, tableClass } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Card, DemoBadge } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import {
  deleteTopicAction,
  saveDisciplineAction,
  saveModuleAction,
  saveTopicAction,
} from '@/features/admin/actions';
import { getDisciplineAdmin } from '@/features/admin/service';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Disciplina' };

export default async function DisciplineAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { id } = await params;
  const user = await requireRole(['admin'], `/admin/disciplinas/${id}`);
  const sp = await searchParams;
  const { discipline: d, course, topics, modules } = await getDisciplineAdmin(user, id);
  const roots = topics.filter((t) => !t.parentId);
  const childrenOf = (pid: string) => topics.filter((t) => t.parentId === pid);
  const ordered = roots.flatMap((r) => [r, ...childrenOf(r.id)]);

  return (
    <div className="grid gap-6">
      <AdminHeader
        title={d.name}
        crumbs={[
          { href: '/admin/cursos', label: 'Cursos' },
          { href: `/admin/cursos/${course.id}`, label: course.name },
        ]}
        action={d.isDemo ? <DemoBadge /> : undefined}
      />
      <Flash {...sp} />

      <section aria-labelledby="mods" className="grid gap-3">
        <h2 id="mods" className="text-xl">
          Módulos
        </h2>
        <Card className="overflow-x-auto p-0 pt-4">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Módulo</th>
                <th>Ordem</th>
                <th>Versão</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/admin/modulos/${m.id}`} className="font-semibold">
                      {m.title}
                    </Link>{' '}
                    {m.isDemo ? <DemoBadge /> : null}
                  </td>
                  <td className="tabular">{m.orderIndex}</td>
                  <td className="tabular">v{m.version}</td>
                  <td>
                    <StatusBadge status={m.status} />
                  </td>
                </tr>
              ))}
              {modules.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted">
                    Nenhum módulo ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
        {topics.length === 0 ? (
          <p className="text-sm text-muted">Crie um assunto antes do primeiro módulo.</p>
        ) : (
          <Card as="section" aria-labelledby="novomod" className="grid gap-4">
            <h3 id="novomod" className="text-lg">
              Novo módulo
            </h3>
            <form action={saveModuleAction} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="disciplineId" value={d.id} />
              <Field label="Título">{(p) => <Input {...p} name="title" required />}</Field>
              <Field label="Assunto">
                {(p) => (
                  <Select {...p} name="topicId" required defaultValue="">
                    <option value="" disabled>
                      Escolha…
                    </option>
                    {ordered.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.parentId ? '— ' : ''}
                        {t.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit">Criar como rascunho</Button>
              </div>
            </form>
          </Card>
        )}
      </section>

      <section aria-labelledby="assuntos" className="grid gap-3">
        <h2 id="assuntos" className="text-xl">
          Assuntos
        </h2>
        <Card className="grid gap-3">
          {ordered.length === 0 ? <p className="text-muted">Nenhum assunto ainda.</p> : null}
          <ul className="grid gap-2">
            {ordered.map((t) => (
              <li
                key={t.id}
                className={`flex flex-wrap items-end gap-2 border-b border-line pb-2 ${t.parentId ? 'pl-6' : ''}`}
              >
                <form action={saveTopicAction} className="flex flex-1 flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="disciplineId" value={d.id} />
                  <input type="hidden" name="parentId" value={t.parentId ?? ''} />
                  <label className="grid min-w-48 flex-1 gap-1 text-xs text-muted">
                    Nome
                    <Input name="name" defaultValue={t.name} required />
                  </label>
                  <label className="grid w-24 gap-1 text-xs text-muted">
                    Ordem
                    <Input name="orderIndex" type="number" min={0} defaultValue={t.orderIndex} />
                  </label>
                  <Button type="submit" variant="secondary">
                    Salvar
                  </Button>
                </form>
                <span className="pb-3 text-xs text-muted">{t.questions} questões</span>
                {t.questions === 0 && childrenOf(t.id).length === 0 ? (
                  <form action={deleteTopicAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="disciplineId" value={d.id} />
                    <Button type="submit" variant="ghost" aria-label={`Excluir ${t.name}`}>
                      Excluir
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          <form
            action={saveTopicAction}
            className="grid gap-3 pt-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <input type="hidden" name="disciplineId" value={d.id} />
            <Field label="Novo assunto">{(p) => <Input {...p} name="name" required />}</Field>
            <Field label="Dentro de" optional>
              {(p) => (
                <Select {...p} name="parentId" defaultValue="">
                  <option value="">Nenhum (assunto principal)</option>
                  {roots.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button type="submit">Adicionar</Button>
          </form>
        </Card>
      </section>

      <Card as="section" aria-labelledby="dados" className="grid gap-4">
        <h2 id="dados" className="text-xl">
          Dados da disciplina
        </h2>
        <form action={saveDisciplineAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="id" value={d.id} />
          <input type="hidden" name="courseId" value={course.id} />
          <Field label="Nome">
            {(p) => <Input {...p} name="name" required defaultValue={d.name} />}
          </Field>
          <Field label="Endereço">
            {(p) => <Input {...p} name="slug" defaultValue={d.slug} />}
          </Field>
          <Field label="Semestre sugerido" optional>
            {(p) => (
              <Input
                {...p}
                name="periodHint"
                type="number"
                min={1}
                max={16}
                defaultValue={d.periodHint ?? ''}
              />
            )}
          </Field>
          <Checkbox name="active" label="Ativa" defaultChecked={d.active} />
          <div className="sm:col-span-2">
            <Field label="Descrição" optional>
              {(p) => (
                <Textarea
                  {...p}
                  name="description"
                  defaultValue={d.description ?? ''}
                  maxLength={500}
                />
              )}
            </Field>
          </div>
          <div>
            <Button type="submit" variant="secondary">
              Salvar disciplina
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
