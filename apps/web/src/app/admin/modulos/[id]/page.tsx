import type { Metadata } from 'next';
import { AdminHeader, Flash, StatusBadge } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Alert, Card, DemoBadge } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { saveModuleAction, transitionModuleAction } from '@/features/admin/actions';
import { getModuleAdmin } from '@/features/admin/service';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Módulo' };

// Próximos passos possíveis em cada status (o trigger do banco confere de novo).
const NEXT: Record<string, { to: string; label: string; variant: 'primary' | 'secondary' }[]> = {
  draft: [{ to: 'in_review', label: 'Enviar para revisão', variant: 'primary' }],
  in_review: [
    { to: 'approved', label: 'Aprovar', variant: 'primary' },
    { to: 'draft', label: 'Devolver ao rascunho', variant: 'secondary' },
  ],
  approved: [
    { to: 'published', label: 'Publicar', variant: 'primary' },
    { to: 'draft', label: 'Voltar ao rascunho', variant: 'secondary' },
  ],
  published: [{ to: 'archived', label: 'Arquivar', variant: 'secondary' }],
  archived: [
    { to: 'published', label: 'Publicar de novo', variant: 'secondary' },
    { to: 'draft', label: 'Voltar ao rascunho', variant: 'secondary' },
  ],
};

export default async function ModuleAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { id } = await params;
  const user = await requireRole(['admin'], `/admin/modulos/${id}`);
  const sp = await searchParams;
  const { module: m, discipline, topics, history } = await getModuleAdmin(user, id);
  const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const isAuthor = m.authorId === user.id;

  return (
    <div className="grid gap-6">
      <AdminHeader
        title={m.title}
        crumbs={[
          { href: '/admin/cursos', label: 'Cursos' },
          { href: `/admin/disciplinas/${discipline.id}`, label: discipline.name },
        ]}
        action={
          <span className="flex items-center gap-2">
            <StatusBadge status={m.status} />
            {m.isDemo ? <DemoBadge /> : null}
          </span>
        }
      />
      <Flash {...sp} />

      <Card as="section" aria-labelledby="fluxo" className="grid gap-3">
        <h2 id="fluxo" className="text-lg">
          Fluxo editorial
        </h2>
        <p className="text-sm text-muted">
          Rascunho → em revisão → aprovado → publicado. Quem escreveu o módulo não aprova o próprio
          conteúdo; o aluno só vê módulo publicado.
        </p>
        {isAuthor && m.status === 'in_review' ? (
          <Alert tone="warn">
            Você é o autor deste módulo: a aprovação precisa ser de outra pessoa.
          </Alert>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {(NEXT[m.status] ?? []).map((n) => (
            <form key={n.to} action={transitionModuleAction}>
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="to" value={n.to} />
              <Button type="submit" variant={n.variant}>
                {n.label}
              </Button>
            </form>
          ))}
        </div>
      </Card>

      <Card as="section" aria-labelledby="conteudo-mod" className="grid gap-4">
        <h2 id="conteudo-mod" className="text-lg">
          Conteúdo
        </h2>
        {m.status === 'published' || m.status === 'approved' ? (
          <Alert tone="warn">Editar um módulo publicado muda o que os alunos veem na hora.</Alert>
        ) : null}
        <form action={saveModuleAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="disciplineId" value={discipline.id} />
          <Field label="Título">
            {(p) => <Input {...p} name="title" required defaultValue={m.title} />}
          </Field>
          <Field label="Endereço">
            {(p) => <Input {...p} name="slug" defaultValue={m.slug} />}
          </Field>
          <Field label="Assunto">
            {(p) => (
              <Select {...p} name="topicId" defaultValue={m.topicId}>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.parentId ? '— ' : ''}
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Ordem na disciplina">
            {(p) => (
              <Input {...p} name="orderIndex" type="number" min={0} defaultValue={m.orderIndex} />
            )}
          </Field>
          <Field
            label="Aula interativa (endereço https)"
            optional
            hint="A origem precisa estar em LESSON_ORIGINS para abrir dentro do app."
          >
            {(p) => <Input {...p} name="lessonUrl" type="url" defaultValue={m.lessonUrl ?? ''} />}
          </Field>
          <Field label="Tempo estimado (min)" optional>
            {(p) => (
              <Input
                {...p}
                name="estMinutes"
                type="number"
                min={1}
                max={240}
                defaultValue={m.estMinutes ?? ''}
              />
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Chamada" optional hint="Uma frase que aparece na capa do módulo.">
              {(p) => <Input {...p} name="lead" maxLength={300} defaultValue={m.lead ?? ''} />}
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Resumo"
              optional
              hint="Markdown simples: ## título, - lista, > citação, **negrito**. Conteúdo de saúde passa pela revisão antes de publicar."
            >
              {(p) => (
                <Textarea
                  {...p}
                  name="summaryMd"
                  className="min-h-72 font-[ui-monospace,monospace] text-sm"
                  defaultValue={m.summaryMd ?? ''}
                />
              )}
            </Field>
          </div>
          <div>
            <Button type="submit">Salvar módulo</Button>
          </div>
        </form>
      </Card>

      <Card as="section" aria-labelledby="hist" className="grid gap-2">
        <h2 id="hist" className="text-lg">
          Histórico
        </h2>
        {history.length === 0 ? <p className="text-sm text-muted">Sem registros ainda.</p> : null}
        <ul className="grid gap-1 text-sm">
          {history.map((h) => (
            <li key={h.id}>
              <span className="text-muted">{fmt.format(h.createdAt)}</span> · {h.action}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
