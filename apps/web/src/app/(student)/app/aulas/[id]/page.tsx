import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LessonStudy } from '@/components/lesson/lesson-study';
import { requireFeature } from '@/features/flags/service';
import { getLessonStudy } from '@/features/lesson-study/service';
import { disciplinesForMaterials } from '@/features/materials/service';
import { ApiError } from '@/lib/api';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Acompanhar aula' };

const UUID = /^[0-9a-f-]{36}$/i;

// Acompanhar Aula (SPEC v2, 5.7; AUL-01): aberta a partir da agenda, da visão geral da
// disciplina ou do conteúdo de aula.
export default async function LessonStudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ material?: string; pagina?: string }>;
}) {
  await requireFeature('aula');
  const { id } = await params;
  const user = await requireStudent(`/app/aulas/${id}`);
  if (!UUID.test(id)) notFound();
  const { material, pagina } = await searchParams;
  const [study, disciplines] = await Promise.all([
    getLessonStudy(user.id, id).catch((err) => {
      if (err instanceof ApiError && err.status === 404) notFound();
      throw err;
    }),
    disciplinesForMaterials(user.id),
  ]);
  return (
    <div className="grid gap-4">
      <Link href={`/app/minhas-disciplinas/${study.lesson.disciplineId}`} className="text-sm">
        {study.lesson.disciplineName}
      </Link>
      <LessonStudy
        // Material, versão ou reassociação nova: estado da tela montado de novo.
        key={study.materials.map((m) => `${m.id}:${m.versionId}:${m.olderAnnotations}`).join(',')}
        study={study}
        disciplines={disciplines}
        initialMaterialId={material && UUID.test(material) ? material : null}
        initialPage={pagina && /^\d{1,4}$/.test(pagina) ? Number(pagina) : null}
      />
    </div>
  );
}
