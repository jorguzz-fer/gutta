import { BAND_LABEL, type Recommendation } from '@gutta/core';
import { CalendarDays, Check, Layers, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { Alert, Badge, Card, DemoBadge } from '@/components/ui/card';
import { MySpace } from '@/components/space/my-space';
import { loadDashboard } from '@/features/dashboard/data';
import { flags } from '@/features/flags/service';
import { weekSummary } from '@/features/planning/service';
import { loadSpace } from '@/features/space/service';
import { requireStudent } from '@/lib/auth/session';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Hoje' };

const WEEKDAY = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_FULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function actionHref(r: Recommendation) {
  if (r.type === 'review_flashcards') return '/app/revisoes';
  if (r.type === 'empty') return '/app/disciplinas';
  if (r.topicId) return `/app/questoes/nova?assunto=${r.topicId}`;
  if (r.type === 'diagnostic' && r.disciplineId)
    return `/app/questoes/nova?disciplina=${r.disciplineId}&modo=diagnostico`;
  return '/app/questoes/nova';
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass-card rounded-[var(--radius)] border border-line bg-surface p-4 md:p-5">
      <dt className="text-xs font-semibold tracking-widest text-muted uppercase">{label}</dt>
      <dd className="tabular mt-2 font-display text-2xl md:text-3xl">{value}</dd>
      {hint ? <dd className="mt-1 text-xs text-accent">{hint}</dd> : null}
    </div>
  );
}

function actionLabel(r: Recommendation) {
  if (r.type === 'review_flashcards') return 'Começar revisão';
  if (r.type === 'empty') return 'Ver disciplinas';
  if (r.type === 'diagnostic') return 'Começar diagnóstico';
  return 'Começar';
}

/*
  Painel "Hoje" (HOME-01). Ordem dos blocos pela prioridade da SPEC: próxima ação, questão do
  dia, revisões, lacunas, provas e semana. Um único botão primário (Von Restorff), que é a
  próxima ação, com a justificativa ao lado (personalização verificável). Sem porcentagem
  de domínio e sem punir dia perdido.
*/
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ 'boas-vindas'?: string; aviso?: string; objetivo?: string }>;
}) {
  const user = await requireStudent();
  const sp = await searchParams;
  // Meu Espaço da v2 (SPEC v2, 5.5) substitui o painel do MVP quando a chave está ligada.
  const on = await flags();
  if (on.meu_espaco) {
    const [space, planning] = await Promise.all([loadSpace(user.id), weekSummary(user.id)]);
    return (
      <div className="grid gap-4">
        {sp['boas-vindas'] ? (
          <Alert tone="success">
            <strong>Tudo pronto.</strong> Seu Meu Espaço já mostra suas disciplinas e sua rotina.
          </Alert>
        ) : null}
        {sp.objetivo ? <Alert tone="success">Objetivo atualizado.</Alert> : null}
        <MySpace
          space={space}
          links={{
            rotina: on.rotina,
            agenda: on.agenda,
            disciplinas: on.disciplinas,
            lembretes: on.lembretes,
            faltas: on.faltas,
            notas: on.notas,
            materiais: on.materiais,
            aula: on.aula,
            equilibrio: on.equilibrio,
          }}
          planning={planning}
        />
      </div>
    );
  }
  const d = await loadDashboard(user.id);
  const fmtDate = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    timeZone: d.timezone,
  });
  const r = d.recommendation;

  return (
    <div className="grid gap-6">
      {sp['boas-vindas'] ? (
        <Alert tone="success">
          <strong>Tudo pronto.</strong> Seu estudo está montado. Comece pelo primeiro passo abaixo:
          leva uns {d.recommendationMinutes} minutos.
        </Alert>
      ) : null}
      {sp.aviso === 'sem-acesso' ? (
        <Alert tone="warn">Essa área é só para a equipe editorial.</Alert>
      ) : null}

      <div className="grid gap-2">
        <h1 className="text-4xl md:text-5xl">Oi{d.firstName ? `, ${d.firstName}` : ''}.</h1>
        <p className="text-muted">Seu próximo passo de estudo está pronto.</p>
      </div>

      {/* Números do protótipo, com dados reais do aluno; nada de ranking ou recorde inventado. */}
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Revisões hoje"
          value={String(d.reviews.total)}
          hint={d.reviews.total ? `~${d.reviews.minutes} min` : 'nada vencido'}
        />
        <Stat label="Questões na semana" value={String(d.week.questions)} />
        <Stat
          label="Dias com estudo"
          value={`${d.week.activeDays} de 7`}
          hint={`meta de ${d.goalMinutes} min/dia`}
        />
        <Stat
          label="Próxima prova"
          value={
            d.exams[0]
              ? d.exams[0].inDays === 0
                ? 'hoje'
                : d.exams[0].inDays === 1
                  ? 'amanhã'
                  : `${d.exams[0].inDays} dias`
              : '—'
          }
          hint={d.exams[0] ? d.exams[0].disciplineName : 'nenhuma cadastrada'}
        />
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-6">
          <Card as="section" aria-labelledby="proximo" className="grid gap-3 border-accent/50 p-6">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-accent uppercase">
              <Sparkles className="size-4" aria-hidden /> Próximo passo
            </p>
            <h2 id="proximo" className="text-2xl md:text-3xl">
              {r.title}
            </h2>
            <p className="text-muted">
              <span className="sr-only">Por quê: </span>
              {r.reason}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link href={actionHref(r)} className={buttonClass('primary', 'lg')}>
                {actionLabel(r)}
              </Link>
              {r.type !== 'empty' ? (
                <span className="text-sm text-muted">cerca de {d.recommendationMinutes} min</span>
              ) : null}
            </div>
          </Card>

          {d.questionOfTheDay ? (
            <Card as="section" aria-labelledby="qdia" className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="qdia" className="text-lg">
                  Questão do dia
                </h2>
                <Badge>{d.questionOfTheDay.topicName}</Badge>
                {d.questionOfTheDay.isDemo ? <DemoBadge /> : null}
              </div>
              <p className="line-clamp-3">{d.questionOfTheDay.stem}</p>
              {d.questionOfTheDay.done ? (
                <p className="flex items-center gap-2 text-sm font-medium text-success">
                  <Check className="size-4" aria-hidden /> Feita hoje. Amanhã tem outra.
                </p>
              ) : (
                <div>
                  <Link
                    href={`/app/questoes/nova?modo=dia&questao=${d.questionOfTheDay.id}`}
                    className={buttonClass('secondary')}
                  >
                    Responder
                  </Link>
                </div>
              )}
            </Card>
          ) : null}

          {/* Revisões logo depois da questão do dia: no celular é a 3ª prioridade da SPEC (Posição Serial). */}
          <Card as="section" aria-labelledby="revisoes" className="grid gap-2">
            <h2 id="revisoes" className="flex items-center gap-2 text-lg">
              <Layers className="size-5 text-muted" aria-hidden /> Revisões
            </h2>
            {d.reviews.total > 0 ? (
              <>
                <p>
                  <strong className="font-display text-2xl">{d.reviews.total}</strong>{' '}
                  {d.reviews.total === 1 ? 'cartão' : 'cartões'} para hoje
                  <span className="text-muted"> · ~{d.reviews.minutes} min</span>
                </p>
                <p className="text-sm text-muted">
                  {d.reviews.due} vencidos{d.reviews.fresh ? `, ${d.reviews.fresh} novos` : ''}
                </p>
                {r.type !== 'review_flashcards' ? (
                  <Link href="/app/revisoes" className="text-sm">
                    Revisar agora
                  </Link>
                ) : null}
              </>
            ) : (
              <p className="text-muted">Nada vencido hoje. Questões erradas podem virar cartões.</p>
            )}
          </Card>

          <section aria-labelledby="lacunas" className="grid gap-3">
            <h2 id="lacunas" className="text-lg">
              Suas disciplinas
            </h2>
            {d.gaps.length === 0 ? (
              <Alert>
                Nenhuma disciplina escolhida. <Link href="/app/perfil">Escolha no perfil</Link> para
                receber recomendações.
              </Alert>
            ) : (
              d.gaps.map((g) => (
                <Card key={g.id} className="grid gap-3 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base">
                      <Link href={`/app/disciplinas/${g.slug}`} className="text-fg">
                        {g.name}
                      </Link>
                    </h3>
                    {d.isNew ? (
                      <span className="text-xs text-muted">aparece conforme você responde</span>
                    ) : null}
                  </div>
                  {g.topics.length === 0 ? (
                    <p className="text-sm text-muted">Ainda sem questões publicadas.</p>
                  ) : (
                    <ul className="grid gap-1.5">
                      {g.topics.map((t) => (
                        <li
                          key={t.id}
                          className="flex items-center justify-between gap-3 text-[15px]"
                        >
                          <span className="min-w-0 truncate">{t.name}</span>
                          <Badge
                            tone={
                              t.band === 'firme'
                                ? 'success'
                                : t.band === 'fragil'
                                  ? 'warn'
                                  : t.band === 'em_construcao'
                                    ? 'accent'
                                    : 'neutral'
                            }
                            className="shrink-0"
                          >
                            {BAND_LABEL[t.band]}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))
            )}
          </section>
        </div>

        <aside className="grid content-start gap-6">
          <Card as="section" aria-labelledby="semana" className="grid gap-3">
            <h2 id="semana" className="text-lg">
              Esta semana
            </h2>
            <ol className="flex justify-between gap-1" aria-label="Dias da semana com estudo">
              {d.week.days.map((day) => (
                <li
                  key={day.key}
                  className={cn(
                    'grid size-9 place-items-center rounded-[var(--radius)] text-sm font-semibold',
                    day.active ? 'bg-accent text-accent-ink' : 'border border-line text-muted',
                    day.isToday && !day.active && 'border-accent text-accent',
                    day.isFuture && 'opacity-50',
                  )}
                  aria-label={`${WEEKDAY_FULL[day.weekday]}: ${day.active ? 'estudou' : day.isFuture ? 'ainda não chegou' : 'sem estudo'}`}
                >
                  <span aria-hidden>{WEEKDAY[day.weekday]}</span>
                </li>
              ))}
            </ol>
            <p className="text-sm text-muted">
              {d.week.activeDays === 0
                ? `Meta: ${d.goalMinutes} min nos dias que você escolheu. Hoje conta.`
                : `${d.week.activeDays} ${d.week.activeDays === 1 ? 'dia' : 'dias'} com estudo · ${d.week.questions} questões · ${d.week.reviews} revisões`}
            </p>
          </Card>

          <Card as="section" aria-labelledby="provas" className="grid gap-2">
            <h2 id="provas" className="flex items-center gap-2 text-lg">
              <CalendarDays className="size-5 text-muted" aria-hidden /> Provas
            </h2>
            {d.exams.length === 0 ? (
              <p className="text-sm text-muted">
                Nenhuma cadastrada. <Link href="/app/perfil">Cadastrar prova</Link> faz as
                recomendações priorizarem essa disciplina.
              </p>
            ) : (
              <ul className="grid gap-2">
                {d.exams.map((e) => (
                  <li key={e.id} className="grid">
                    <span className="font-medium">
                      {e.title} · {e.disciplineName}
                    </span>
                    <span className="text-sm text-muted">
                      {fmtDate.format(e.examAt)} ·{' '}
                      {e.inDays === 0 ? 'hoje' : e.inDays === 1 ? 'amanhã' : `em ${e.inDays} dias`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
