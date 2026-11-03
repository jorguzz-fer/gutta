import { AlertTriangle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Flash, tableClass } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { updateClassAction } from '@/features/classes/actions';
import { getClassDashboard } from '@/features/classes/service';
import { requireRole } from '@/lib/auth/session';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Turma' };

const pct = (correct: number, total: number) =>
  total ? Math.round((correct / total) * 100) : null;

function Bar({ value }: { value: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded bg-surface-2" aria-hidden>
        {value !== null ? (
          <div
            className={cn(
              'h-full rounded',
              value < 50 ? 'bg-danger' : value < 70 ? 'bg-warn' : 'bg-success',
            )}
            style={{ width: `${value}%` }}
          />
        ) : null}
      </div>
      <span className="tabular text-sm">{value === null ? '—' : `${value}%`}</span>
    </div>
  );
}

/*
  Painel da turma. Números são agregados das funções class_* (só desde a entrada de cada
  aluno). Taxa de acerto em porcentagem aqui faz sentido: é a turma, com amostra visível ao lado.
*/
export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { id } = await params;
  const user = await requireRole(['teacher', 'admin'], `/professor/turmas/${id}`);
  const sp = await searchParams;
  const d = await getClassDashboard(user, id);
  const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
  const attention = d.students.filter((s) => s.attention);
  const weekAcc = d.week.accuracy === null ? null : Math.round(d.week.accuracy * 100);

  return (
    <div className="grid gap-8">
      <nav aria-label="Trilha" className="text-sm">
        <Link href="/professor">Suas turmas</Link> <span className="text-muted">/</span>{' '}
        <span aria-current="page">{d.klass.name}</span>
      </nav>
      <header className="grid gap-3">
        <p className="text-xs font-semibold tracking-[0.25em] text-accent uppercase">
          {d.discipline?.name ?? 'Turma'}
          {!d.klass.active ? ' · encerrada' : ''}
        </p>
        <h1 className="text-4xl md:text-5xl">{d.klass.name}</h1>
      </header>
      <Flash {...sp} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {[
            ['Alunos', String(d.students.length), 'na turma agora'],
            [
              'Ativos na semana',
              `${d.week.activeStudents} de ${d.students.length}`,
              'responderam questões',
            ],
            [
              'Acerto na semana',
              weekAcc === null ? '—' : `${weekAcc}%`,
              `${d.week.attempts} respostas`,
            ],
          ].map(([label, value, hint]) => (
            <div
              key={label}
              className="glass-card rounded-[var(--radius)] border border-line bg-surface p-4 md:p-5"
            >
              <dt className="text-xs font-semibold tracking-widest text-muted uppercase">
                {label}
              </dt>
              <dd className="tabular mt-2 font-display text-2xl md:text-3xl">{value}</dd>
              <dd className="mt-1 text-xs text-accent">{hint}</dd>
            </div>
          ))}
        </dl>
        <Card as="section" aria-labelledby="codigo" className="grid content-start gap-2">
          <h2 id="codigo" className="text-lg">
            Código da turma
          </h2>
          <p
            className="font-display text-3xl tracking-[0.2em]"
            aria-label={`Código ${d.klass.joinCode.split('').join(' ')}`}
          >
            {d.klass.joinCode}
          </p>
          <p className="text-sm text-muted">
            O aluno entra em Perfil → Turmas. Ao entrar, ele é avisado de que você verá o desempenho
            dele.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <form action={updateClassAction}>
              <input type="hidden" name="id" value={d.klass.id} />
              <input type="hidden" name="op" value="codigo" />
              <Button type="submit" variant="secondary">
                Gerar código novo
              </Button>
            </form>
            <form action={updateClassAction}>
              <input type="hidden" name="id" value={d.klass.id} />
              <input type="hidden" name="op" value={d.klass.active ? 'encerrar' : 'reabrir'} />
              <Button type="submit" variant="ghost">
                {d.klass.active ? 'Encerrar entradas' : 'Reabrir turma'}
              </Button>
            </form>
          </div>
        </Card>
      </div>

      <section aria-labelledby="atencao" className="grid gap-3">
        <h2 id="atencao" className="flex items-center gap-2 text-xl">
          <AlertTriangle className="size-5 text-warn" aria-hidden /> Precisam de atenção
        </h2>
        {d.students.length === 0 ? (
          <Card>
            <p className="text-muted">
              Ninguém na turma ainda. Passe o código{' '}
              <strong className="tracking-widest">{d.klass.joinCode}</strong> para os alunos.
            </p>
          </Card>
        ) : attention.length === 0 ? (
          <Card>
            <p className="text-muted">
              Todo mundo estudou nesta semana e está acertando pelo menos metade.
            </p>
          </Card>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((s) => (
              <li key={s.student_id}>
                <Card className="grid gap-1 p-4">
                  <span className="font-semibold">{s.display_name}</span>
                  <span className="text-sm text-muted">
                    {s.attention!.text}
                    {s.last_activity
                      ? ` · última vez em ${fmt.format(new Date(s.last_activity))}`
                      : ''}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="assuntos" className="grid gap-3">
        <h2 id="assuntos" className="text-xl">
          Desempenho por assunto
        </h2>
        <p className="text-sm text-muted">Do mais difícil para o mais fácil para a turma.</p>
        <Card className="overflow-x-auto p-0 pt-4">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Assunto</th>
                <th>Alunos</th>
                <th>Respostas</th>
                <th>Acerto</th>
              </tr>
            </thead>
            <tbody>
              {d.topics.map((t) => (
                <tr key={t.topic_id}>
                  <td>
                    <span className="font-semibold">{t.topic_name}</span>
                    <div className="text-xs text-muted">{t.discipline_name}</div>
                  </td>
                  <td className="tabular">{t.students}</td>
                  <td className="tabular">{t.attempts}</td>
                  <td>
                    <Bar value={pct(t.correct, t.attempts)} />
                  </td>
                </tr>
              ))}
              {d.topics.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted">
                    Sem respostas desde que os alunos entraram.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>

      <section aria-labelledby="erros" className="grid gap-3">
        <h2 id="erros" className="text-xl">
          Questões que a turma mais erra
        </h2>
        {d.missed.length === 0 ? (
          <Card>
            <p className="text-muted">Nenhum erro registrado ainda.</p>
          </Card>
        ) : (
          <ol className="grid gap-2">
            {d.missed.map((q) => (
              <li key={q.question_id}>
                <Card className="grid gap-1 p-4">
                  <span className="text-xs font-semibold tracking-widest text-muted uppercase">
                    {q.topic_name}
                  </span>
                  <span className="line-clamp-2">{q.stem}</span>
                  <span className="text-sm text-muted">
                    {q.wrong} de {q.attempts} erraram
                    {q.common_wrong ? ` · resposta errada mais comum: “${q.common_wrong}”` : ''}
                  </span>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="alunos" className="grid gap-3">
        <h2 id="alunos" className="text-xl">
          Alunos
        </h2>
        <Card className="overflow-x-auto p-0 pt-4">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Entrou</th>
                <th>Semana</th>
                <th>Acerto (semana)</th>
                <th>Desde a entrada</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {d.students.map((s) => (
                <tr key={s.student_id}>
                  <td>
                    <span className="font-semibold">{s.display_name}</span>{' '}
                    {s.attention ? <Badge tone="warn">atenção</Badge> : null}
                  </td>
                  <td className="tabular text-sm">{fmt.format(new Date(s.joined_at))}</td>
                  <td className="tabular">{s.attempts_7d}</td>
                  <td>
                    <Bar value={pct(s.correct_7d, s.attempts_7d)} />
                  </td>
                  <td className="tabular text-sm">
                    {s.attempts} respostas · {pct(s.correct, s.attempts) ?? '—'}
                    {s.attempts ? '%' : ''}
                  </td>
                  <td>
                    <form action={updateClassAction}>
                      <input type="hidden" name="id" value={d.klass.id} />
                      <input type="hidden" name="op" value="remover" />
                      <input type="hidden" name="studentId" value={s.student_id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        aria-label={`Remover ${s.display_name} da turma`}
                      >
                        Remover
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
