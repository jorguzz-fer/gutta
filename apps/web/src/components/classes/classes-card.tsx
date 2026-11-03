import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { joinClassAction, leaveClassAction } from '@/features/classes/actions';

type Joined = { id: string; name: string; joinedAt: Date; teacherName: string | null };

// Turmas no perfil do aluno: entrar pelo código, ver em quais está e sair (LGPD: transparência).
export function ClassesCard({
  classes,
  ok,
  erro,
}: {
  classes: Joined[];
  ok?: string;
  erro?: string;
}) {
  const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });
  return (
    <Card as="section" aria-labelledby="turmas" className="grid gap-4">
      <h2 id="turmas" className="text-xl">
        Turmas
      </h2>
      {erro ? <Alert tone="danger">{erro}</Alert> : ok ? <Alert tone="success">{ok}</Alert> : null}
      {classes.length ? (
        <ul className="grid gap-2">
          {classes.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2"
            >
              <span>
                <strong>{c.name}</strong>
                <span className="block text-sm text-muted">
                  {c.teacherName ? `Professor(a) ${c.teacherName} · ` : ''}desde{' '}
                  {fmt.format(c.joinedAt)}
                </span>
              </span>
              <form action={leaveClassAction}>
                <input type="hidden" name="id" value={c.id} />
                <Button type="submit" variant="ghost">
                  Sair da turma
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Você não está em nenhuma turma.</p>
      )}
      <form action={joinClassAction} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field
          label="Código da turma"
          hint="Ao entrar, o professor passa a ver quantas questões você responde, seus acertos por assunto e sua última atividade, só a partir de hoje. Ele não vê seus flashcards nem seus dados pessoais. Você pode sair quando quiser."
        >
          {(p) => (
            <Input
              {...p}
              name="code"
              required
              autoComplete="off"
              placeholder="K7Q2MP"
              className="uppercase"
            />
          )}
        </Field>
        <Button type="submit" variant="secondary">
          Entrar na turma
        </Button>
      </form>
    </Card>
  );
}
