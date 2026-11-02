import type { Metadata } from 'next';
import { SessionStarter } from '@/components/questions/session-starter';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Preparando questões' };

type SP = {
  modo?: string;
  modulo?: string;
  disciplina?: string;
  assunto?: string | string[];
  questao?: string;
  n?: string;
};

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStudent('/app/questoes');
  const sp = await searchParams;
  const mode = sp.modo === 'diagnostico' ? 'diagnostic' : sp.modo === 'dia' ? 'daily' : 'practice';
  const topicIds = sp.assunto ? (Array.isArray(sp.assunto) ? sp.assunto : [sp.assunto]) : undefined;
  return (
    <SessionStarter
      params={{
        mode,
        moduleId: sp.modulo,
        disciplineId: sp.disciplina,
        topicIds,
        questionId: sp.questao,
        count: sp.n ? Number(sp.n) : undefined,
      }}
    />
  );
}
