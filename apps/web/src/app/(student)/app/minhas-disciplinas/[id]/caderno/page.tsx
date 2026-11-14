import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IMPORTANCE_LABEL } from '@/components/lesson/labels';
import { NoteView } from '@/components/lesson/note-view';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { currentDisciplines } from '@/features/academics/service';
import { requireFeature } from '@/features/flags/service';
import { listNotes } from '@/features/lesson-study/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Caderno da disciplina' };

const DAY = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Meu caderno da disciplina (SPEC v2, AUL-23): as anotações de todas as aulas, por data, aula,
// slide e importância, com busca por palavra (AUL-11).
export default async function DisciplineNotebookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; so?: string }>;
}) {
  await requireFeature('aula');
  const { id } = await params;
  const user = await requireStudent(`/app/minhas-disciplinas/${id}/caderno`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { q = '', so } = await searchParams;
  const term = q.trim().slice(0, 200);
  const discipline = (await currentDisciplines(user.id)).find((d) => d.id === id);
  if (!discipline) notFound();
  const { items } = await listNotes(user.id, { disciplineId: id, q: term || undefined });
  const shown =
    so === 'importantes' ? items.filter((n) => n.importance && n.importance !== 'nenhuma') : items;
  // Agrupa por aula, na ordem das aulas.
  const groups = new Map<string, typeof shown>();
  for (const n of shown) {
    const k = n.lessonId ?? 'sem-aula';
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href={`/app/minhas-disciplinas/${id}`} className="text-sm">
          {discipline.name}
        </Link>
        <h1 className="text-3xl md:text-4xl">Caderno da disciplina</h1>
      </div>
      <form method="get" role="search" className="flex flex-wrap items-end gap-2">
        <div className="grid flex-1 gap-1">
          <label htmlFor="q" className="text-sm font-semibold">
            Buscar no caderno
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={term}
            className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-4"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="so" className="text-sm font-semibold">
            Mostrar
          </label>
          <select
            id="so"
            name="so"
            defaultValue={so === 'importantes' ? 'importantes' : ''}
            className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2"
          >
            <option value="">Todas as notas</option>
            <option value="importantes">Só de slides importantes</option>
          </select>
        </div>
        <Button type="submit">Filtrar</Button>
      </form>
      {shown.length === 0 ? (
        <p>
          {term || so
            ? 'Nenhuma nota com esse filtro.'
            : 'As notas que você escrever nas aulas aparecem aqui.'}
        </p>
      ) : (
        <ol className="grid gap-4">
          {[...groups.entries()].map(([k, notes]) => {
            const first = notes[0]!;
            return (
              <li key={k}>
                <Card as="section" aria-labelledby={`aula-${k}`} className="grid gap-3">
                  <h2 id={`aula-${k}`} className="text-lg font-semibold">
                    {first.lessonId ? (
                      <Link href={`/app/aulas/${first.lessonId}`}>{first.lessonTitle}</Link>
                    ) : (
                      'Sem aula'
                    )}
                    {first.lessonDate ? (
                      <span className="ml-2 text-sm font-normal text-muted">
                        {DAY.format(new Date(`${first.lessonDate}T12:00:00Z`))}
                      </span>
                    ) : null}
                  </h2>
                  <ul className="grid gap-3">
                    {notes.map((n) => (
                      <li
                        key={n.id}
                        className="grid gap-1 border-t border-line pt-3 first:border-0 first:pt-0"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          {n.page && n.lessonId ? (
                            <Link
                              href={`/app/aulas/${n.lessonId}?material=${n.materialId}&pagina=${n.page}`}
                            >
                              Slide {n.page}
                              {n.materialTitle ? ` · ${n.materialTitle}` : ''}
                            </Link>
                          ) : null}
                          {n.importance && n.importance !== 'nenhuma' ? (
                            <Badge tone="accent">{IMPORTANCE_LABEL[n.importance]}</Badge>
                          ) : null}
                        </div>
                        <NoteView text={n.text} />
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
