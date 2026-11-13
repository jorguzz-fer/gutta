import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LessonPlanner } from '@/components/materials/lesson-planner';
import { requireFeature } from '@/features/flags/service';
import { disciplinesForMaterials, lessonContent } from '@/features/materials/service';
import { ApiError } from '@/lib/api';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Conteúdo de aula' };

// Conteúdo de aula da disciplina (SPEC v2, MAT-02, MAT-03).
export default async function LessonContentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFeature('materiais');
  const { id } = await params;
  const user = await requireStudent(`/app/materiais/disciplina/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [content, disciplines] = await Promise.all([
    lessonContent(user.id, id).catch((err) => {
      if (err instanceof ApiError && err.status === 404) notFound();
      throw err;
    }),
    disciplinesForMaterials(user.id),
  ]);
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/app/materiais" className="text-sm">
          Material de estudo
        </Link>
        <h1 className="text-3xl md:text-4xl">Conteúdo de aula: {content.disciplineName}</h1>
      </div>
      <LessonPlanner disciplineId={id} lessons={content.lessons} disciplines={disciplines} />
      {content.loose.length ? (
        <section aria-labelledby="sem-aula" className="grid gap-2">
          <h2 id="sem-aula" className="text-lg font-semibold">
            Materiais da disciplina sem aula
          </h2>
          <ul className="grid gap-1">
            {content.loose.map((m) => (
              <li key={m.id}>
                <Link href={`/app/materiais/${m.id}`}>{m.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
