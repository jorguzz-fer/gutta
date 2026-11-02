import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { QuestionPlayer } from '@/components/questions/question-player';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Questões' };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await requireStudent(`/app/questoes/sessao/${id}`);
  return (
    <div className="mx-auto max-w-2xl">
      <QuestionPlayer sessionId={id} />
    </div>
  );
}
