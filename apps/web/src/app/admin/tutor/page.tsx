import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminHeader, Checkbox, Flash, tableClass } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { saveTutorSettingsAction } from '@/features/tutor/actions';
import { tutorAdminOverview } from '@/features/tutor/service';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Tutor IA' };

const usd = (micros: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(micros / 1_000_000);
const num = new Intl.NumberFormat('pt-BR');

export default async function TutorAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await requireRole(['admin'], '/admin/tutor');
  const sp = await searchParams;
  const o = await tutorAdminOverview(user);
  const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const perStudent = o.month.students ? o.month.cost / o.month.students : 0;
  return (
    <div className="grid gap-6">
      <AdminHeader
        title="Tutor IA"
        lead="Responde só com o material publicado de cada módulo e com as questões que o aluno já respondeu. Custos estimados pela tabela de preços; a fatura real é a do console da Anthropic."
      />
      <Flash {...sp} />
      {!o.providerReady ? (
        <Alert tone="warn">
          Sem ANTHROPIC_API_KEY no servidor: o tutor aparece como desligado para os alunos. Cadastre
          a chave no Coolify e faça um redeploy.
        </Alert>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Perguntas hoje', num.format(o.day.questions), `${o.day.students} alunos`],
          ['Perguntas em 30 dias', num.format(o.month.questions), `${o.month.students} alunos`],
          ['Custo em 30 dias', usd(o.month.cost), `7 dias: ${usd(o.week.cost)}`],
          ['Custo por aluno (30 dias)', usd(perStudent), `${o.month.refused} recusas`],
        ].map(([l, v, h]) => (
          <div
            key={l}
            className="glass-card rounded-[var(--radius)] border border-line bg-surface p-4 md:p-5"
          >
            <dt className="text-xs font-semibold tracking-widest text-muted uppercase">{l}</dt>
            <dd className="tabular mt-2 font-display text-2xl">{v}</dd>
            <dd className="mt-1 text-xs text-accent">{h}</dd>
          </div>
        ))}
      </dl>

      <Card as="section" aria-labelledby="config" className="grid gap-4">
        <h2 id="config" className="text-xl">
          Configuração
        </h2>
        <p className="text-sm text-muted">
          Provedor: {o.provider} · modelo: {o.model} · tokens em 30 dias:{' '}
          {num.format(o.month.input)} de entrada, {num.format(o.month.output)} de saída,{' '}
          {num.format(o.month.cache_read)} lidos do cache.
        </p>
        <form
          action={saveTutorSettingsAction}
          className="grid gap-4 sm:grid-cols-[auto_12rem_auto] sm:items-end"
        >
          <Checkbox
            name="enabled"
            label="Tutor ligado para os alunos"
            defaultChecked={o.settings.enabled}
          />
          <Field label="Perguntas por aluno em 24 h">
            {(p) => (
              <Input
                {...p}
                name="dailyLimit"
                type="number"
                min={0}
                max={500}
                defaultValue={o.settings.dailyLimit}
              />
            )}
          </Field>
          <Button type="submit">Salvar</Button>
        </form>
      </Card>

      <section aria-labelledby="conversas" className="grid gap-3">
        <h2 id="conversas" className="text-xl">
          Conversas recentes
        </h2>
        <p className="text-sm text-muted">Abrir uma conversa fica registrado na auditoria.</p>
        <Card className="overflow-x-auto p-0 pt-4">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Módulo</th>
                <th>Mensagens</th>
                <th>Última</th>
              </tr>
            </thead>
            <tbody>
              {o.recent.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/tutor/${c.id}`} className="font-semibold">
                      {c.studentName ?? 'Aluno'}
                    </Link>
                  </td>
                  <td>{c.moduleTitle}</td>
                  <td className="tabular">{c.messages}</td>
                  <td className="tabular text-sm">
                    {c.lastAt ? fmt.format(new Date(c.lastAt)) : '—'}
                  </td>
                </tr>
              ))}
              {o.recent.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted">
                    Nenhuma conversa ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
