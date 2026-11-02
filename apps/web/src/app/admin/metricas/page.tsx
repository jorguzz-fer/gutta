import type { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { loadMetrics } from '@/features/metrics/service';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Métricas · Editorial' };

const SMALL = 20;
const REASON: Record<string, string> = {
  flashcards_due: 'Revisões vencidas',
  exam_soon_weak_topic: 'Prova próxima, assunto fraco',
  exam_soon_no_data: 'Prova próxima, sem dados',
  no_diagnostic: 'Sem diagnóstico',
  weak_topic: 'Assunto fraco',
  least_practiced: 'Menos praticado',
  no_content: 'Sem conteúdo',
};

function Ratio({ num, den }: { num: number; den: number }) {
  if (den === 0) return <span className="text-base font-normal text-muted">sem base ainda</span>;
  if (den < SMALL) {
    return (
      <span>
        {num} de {den}{' '}
        <span className="block text-xs text-muted">amostra pequena: sem porcentagem</span>
      </span>
    );
  }
  return (
    <span>
      {Math.round((num / den) * 100)}%{' '}
      <span className="text-xs text-muted">
        ({num} de {den})
      </span>
    </span>
  );
}

function Tile({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <Card className="grid content-start gap-1 p-4">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-display text-2xl font-bold tabular-nums">{value}</span>
      {note ? <span className="text-xs text-muted">{note}</span> : null}
    </Card>
  );
}

/*
  Métricas do piloto (SPEC §1.4 e roadmap F3). Números reais do banco; amostra pequena aparece
  como "x de y". Um gráfico de série única (ativos por dia), sem legenda, com tooltip por barra
  e a mesma informação em tabela.
*/
export default async function MetricsPage() {
  const user = await requireRole(['admin'], '/admin/metricas');
  const m = await loadMetrics(user.id);
  const max = Math.max(1, ...m.daily.map((d) => d.active));
  const dayLabel = (key: string) => key.slice(8, 10) + '/' + key.slice(5, 7);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">Métricas</h1>
        <p className="text-muted">
          Últimos 7 dias, salvo indicação. Estudo ativo = responder questão ou revisar cartão.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Estudantes ativos na semana (WALS)" value={m.wals} note="métrica norteadora" />
        <Tile
          label="Ativação (onboarding concluído)"
          value={<Ratio num={m.onboarded} den={m.signups} />}
        />
        <Tile
          label="Retenção D1"
          value={<Ratio num={m.retention.d1} den={m.retention.d1_base} />}
        />
        <Tile
          label="Retenção D7"
          value={<Ratio num={m.retention.d7} den={m.retention.d7_base} />}
          note="meta do piloto: ≥ 40%"
        />
        <Tile
          label="Questões por estudante ativo"
          value={m.week.questionsPerActive}
          note="meta do piloto: ≥ 20 por semana"
        />
        <Tile
          label="Acerto nas questões"
          value={<Ratio num={m.week.accuracy.correct} den={m.week.accuracy.total} />}
        />
        <Tile label="Revisões de flashcard" value={m.week.reviews} />
        <Tile label="Flashcards criados" value={m.week.flashcardsCreated} />
      </div>

      <Card as="section" aria-labelledby="ativos-dia" className="grid gap-4">
        <h2 id="ativos-dia" className="text-lg font-bold">
          Estudantes ativos por dia (14 dias)
        </h2>
        <div
          className="grid h-44 grid-cols-14 items-end gap-[2px] border-b border-line"
          role="img"
          aria-label="Gráfico de estudantes ativos por dia; os valores estão na tabela abaixo"
        >
          {m.daily.map((d) => (
            <div
              key={d.day}
              className="group relative flex h-full items-end justify-center"
              tabIndex={0}
              aria-label={`${dayLabel(d.day)}: ${d.active}`}
            >
              <div
                className="w-full max-w-7 rounded-t-[4px] bg-accent transition-opacity group-hover:opacity-80"
                style={{
                  height: d.active ? `${Math.max(4, (d.active / max) * 100)}%` : '2px',
                  opacity: d.active ? 1 : 0.35,
                }}
              />
              <span className="pointer-events-none absolute -top-8 z-10 hidden rounded-md border border-line bg-surface px-2 py-1 text-xs whitespace-nowrap shadow-sm group-hover:block group-focus:block">
                {dayLabel(d.day)} · <strong>{d.active}</strong>
              </span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-14 gap-[2px] text-center font-mono text-[10px] text-muted">
          {m.daily.map((d, i) => (
            <span key={d.day}>{i % 2 === 1 ? '' : dayLabel(d.day)}</span>
          ))}
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-accent">Ver como tabela</summary>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-medium">Dia</th>
                <th className="py-1 font-medium">Estudantes ativos</th>
              </tr>
            </thead>
            <tbody>
              {m.daily.map((d) => (
                <tr key={d.day} className="border-t border-line">
                  <td className="py-1">{dayLabel(d.day)}</td>
                  <td className="py-1 tabular-nums">{d.active}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="dificeis" className="grid gap-2">
          <h2 id="dificeis" className="text-lg font-bold">
            Questões com menor acerto
          </h2>
          <p className="text-sm text-muted">
            Só com 5 respostas ou mais. Pode indicar gabarito ou enunciado a revisar.
          </p>
          {m.hardest.length === 0 ? (
            <p className="text-muted">Ainda não há questões com respostas suficientes.</p>
          ) : (
            <ol className="grid gap-2">
              {m.hardest.map((q) => (
                <li key={q.id} className="grid">
                  <a href={`/admin/questoes/${q.id}`} className="line-clamp-2">
                    {q.stem}
                  </a>
                  <span className="text-xs text-muted">
                    {q.correct} de {q.attempts} acertos
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card as="section" aria-labelledby="motivos" className="grid gap-2">
          <h2 id="motivos" className="text-lg font-bold">
            Recomendações mostradas, por motivo
          </h2>
          {m.reasons.length === 0 ? (
            <p className="text-muted">Nenhuma nesta semana.</p>
          ) : (
            <table className="text-sm">
              <tbody>
                {m.reasons
                  .sort((a, b) => b.n - a.n)
                  .map((r) => (
                    <tr key={r.reason} className="border-t border-line first:border-0">
                      <td className="py-1.5">{REASON[r.reason] ?? r.reason}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.n}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
