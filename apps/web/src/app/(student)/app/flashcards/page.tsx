import type { Metadata } from 'next';
import Link from 'next/link';
import { NewCardForm } from '@/components/flashcards/new-card-form';
import { EmptyState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { deleteCardAction } from '@/features/flashcards/actions';
import { listPersonal } from '@/features/flashcards/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Meus cartões' };

export default async function FlashcardsPage() {
  const user = await requireStudent('/app/flashcards');
  const cards = await listPersonal(user.id);
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  });
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-bold">Meus cartões</h1>
        <Link href="/app/revisoes" className="text-sm">
          Ir para as revisões
        </Link>
      </div>
      <p className="text-muted">
        Só você vê os seus cartões. Os da plataforma entram sozinhos nas revisões.
      </p>

      <Card as="section" aria-labelledby="novo">
        <h2 id="novo" className="mb-3 text-lg font-bold">
          Novo cartão
        </h2>
        <NewCardForm />
      </Card>

      <section className="grid gap-3" aria-labelledby="lista">
        <h2 id="lista" className="text-lg font-bold">
          {cards.length} {cards.length === 1 ? 'cartão' : 'cartões'}
        </h2>
        {cards.length === 0 ? (
          <EmptyState title="Nenhum cartão seu ainda">
            Ao errar uma questão, use &quot;Criar flashcard deste erro&quot;. Ou escreva um aqui em
            cima.
          </EmptyState>
        ) : (
          <ul className="grid gap-2">
            {cards.map((c) => (
              <Card as="li" key={c.id} className="grid gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {c.fromQuestion ? <Badge>de uma questão</Badge> : null}
                  {c.dueAt ? (
                    <span className="text-xs text-muted">
                      próxima revisão: {fmt.format(c.dueAt)}
                    </span>
                  ) : null}
                </div>
                <p className="font-semibold">{c.front}</p>
                <details>
                  <summary className="cursor-pointer text-sm text-accent">Ver verso</summary>
                  <p className="mt-1 text-[15px] whitespace-pre-line text-muted">{c.back}</p>
                </details>
                <form action={deleteCardAction} className="justify-self-end">
                  <input type="hidden" name="id" value={c.id} />
                  <Button type="submit" variant="ghost">
                    Apagar
                  </Button>
                </form>
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
