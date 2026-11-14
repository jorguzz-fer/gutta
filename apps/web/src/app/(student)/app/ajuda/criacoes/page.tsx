import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card } from '@/components/ui/card';
import { listCreations } from '@/features/ajuda/service';
import { requireFeature } from '@/features/flags/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Minhas criações' };

const TYPE_LABEL = {
  resumo: 'Resumo',
  flashcards: 'Flashcards',
  questoes: 'Questões',
  mapa: 'Mapa mental',
  roteiro: 'Roteiro',
  analise: 'Análise de provas',
} as const;
const DAY = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Minhas criações (SPEC v2, AJU-10): tudo o que a IA produziu, por disciplina.
export default async function CreationsPage() {
  await requireFeature('ajuda');
  const user = await requireStudent('/app/ajuda/criacoes');
  const { items } = await listCreations(user.id, {});
  const groups = new Map<string, typeof items>();
  for (const c of items) {
    const k = c.disciplineName ?? 'Sem disciplina';
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/app/ajuda" className="text-sm">
          Ajuda Cognuss
        </Link>
        <h1 className="text-3xl md:text-4xl">Minhas criações</h1>
      </div>
      <div>
        <Link href="/app/ajuda/criar">Criar com IA</Link>
      </div>
      {items.length === 0 ? (
        <p>Nada criado ainda.</p>
      ) : (
        [...groups.entries()].map(([name, list]) => (
          <Card as="section" key={name} aria-label={name} className="grid gap-3">
            <h2 className="text-lg font-semibold">{name}</h2>
            <ul className="grid gap-2">
              {list.map((c) => (
                <li
                  key={c.id}
                  className="grid gap-1 border-t border-line pt-2 first:border-0 first:pt-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/app/ajuda/criacoes/${c.id}`} className="font-semibold">
                      {c.title}
                    </Link>
                    <Badge tone="neutral">{TYPE_LABEL[c.type]}</Badge>
                    {c.stale ? <Badge tone="warn">Desatualizada</Badge> : null}
                  </div>
                  <p className="text-sm text-muted">
                    {DAY.format(new Date(c.createdAt))}
                    {c.sourceTitles.length ? ` · de ${c.sourceTitles.join(', ')}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
