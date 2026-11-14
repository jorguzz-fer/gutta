import type { Metadata } from 'next';
import Link from 'next/link';
import { AI_FEATURES } from '@gutta/db';
import { AdminHeader, Checkbox, Flash, tableClass } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { saveAiSettingsAction } from '@/features/ai-admin/actions';
import { aiAdminOverview, FEATURE_LABEL } from '@/features/ai-admin/service';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Custos de IA' };

const usd = (micros: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(micros / 1e6);
const num = new Intl.NumberFormat('pt-BR');

// Rede de proteção da camada de IA (SPEC v2, 7.7; plano, item 64).
export default async function AiAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await requireRole(['admin'], '/admin/ia');
  const sp = await searchParams;
  const o = await aiAdminOverview(user);
  return (
    <div className="grid gap-6">
      <AdminHeader
        title="Custos de IA"
        lead="Gasto estimado pela tabela de preços, por recurso. Sem teto por aluno durante o QA: o alerta avisa os admins por e-mail e não bloqueia ninguém. A fatura real é a do console da Anthropic."
      />
      <Flash {...sp} />
      {o.overThreshold ? (
        <Alert tone="warn">
          O gasto do mês ({usd(o.totals.month_to_date)}) passou do valor do alerta (
          {usd((o.settings.alertMonthlyUsd ?? 0) * 1e6)}). Veja abaixo o recurso que mais gastou e,
          se precisar, desligue-o.
        </Alert>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Últimas 24 horas', usd(o.totals.day)],
          ['Últimos 7 dias', usd(o.totals.week)],
          ['Últimos 30 dias', usd(o.totals.month)],
          ['Este mês', usd(o.totals.month_to_date)],
        ].map(([l, v]) => (
          <div
            key={l}
            className="glass-card rounded-[var(--radius)] border border-line bg-surface p-4 md:p-5"
          >
            <dt className="text-xs font-semibold tracking-widest text-muted uppercase">{l}</dt>
            <dd className="tabular mt-2 font-display text-2xl">{v}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="por-recurso" className="grid gap-3">
        <h2 id="por-recurso" className="text-xl">
          Por recurso, nos últimos 30 dias
        </h2>
        <Card className="overflow-x-auto p-0 pt-4">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Recurso</th>
                <th>Chamadas</th>
                <th>Alunos</th>
                <th>Custo</th>
                <th>Custo por aluno</th>
                <th>Recusas</th>
                <th>Tokens (entrada / saída)</th>
              </tr>
            </thead>
            <tbody>
              {o.byFeature.map((r) => (
                <tr key={r.feature}>
                  <td className="font-semibold">{r.label}</td>
                  <td className="tabular">{num.format(r.calls)}</td>
                  <td className="tabular">{num.format(r.students)}</td>
                  <td className="tabular">{usd(r.cost)}</td>
                  <td className="tabular">{usd(r.students ? r.cost / r.students : 0)}</td>
                  <td className="tabular">{num.format(r.refused)}</td>
                  <td className="tabular text-sm">
                    {num.format(r.input)} / {num.format(r.output)}
                  </td>
                </tr>
              ))}
              {o.byFeature.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted">
                    Nenhum uso de IA nos últimos 30 dias.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>

      <Card as="section" aria-labelledby="protecao" className="grid gap-4">
        <h2 id="protecao" className="text-xl">
          Recursos e alerta
        </h2>
        <p className="text-sm text-muted">
          Desligar um recurso vale na hora: pedidos novos não entram e os que estão na fila terminam
          com aviso. O tutor do módulo tem a configuração própria em{' '}
          <Link href="/admin/tutor">Tutor IA</Link>.
        </p>
        <form action={saveAiSettingsAction} className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold">Ligados para os alunos</legend>
            {AI_FEATURES.map((f) => (
              <Checkbox
                key={f}
                name={`on_${f}`}
                label={FEATURE_LABEL[f]}
                defaultChecked={!o.settings.disabled.includes(f)}
              />
            ))}
          </fieldset>
          <div className="max-w-xs">
            <Field
              label="Alerta quando o gasto do mês passar de (US$)"
              hint="Vazio ou zero: sem alerta."
            >
              {(p) => (
                <Input
                  {...p}
                  name="alertMonthlyUsd"
                  inputMode="decimal"
                  defaultValue={o.settings.alertMonthlyUsd ?? ''}
                />
              )}
            </Field>
          </div>
          <div>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
        {o.alerts.length ? (
          <div className="grid gap-1 text-sm">
            <h3 className="font-semibold">Alertas enviados</h3>
            <ul className="grid gap-1">
              {o.alerts.map((a) => (
                <li key={a.period}>
                  {a.period}: {usd(a.totalMicros)} (limite {usd(a.thresholdMicros)})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
