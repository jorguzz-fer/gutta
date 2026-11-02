import type { Metadata } from 'next';
import Link from 'next/link';
import { QuestionForm } from '@/components/editorial/question-form';
import { editorialTopics } from '@/features/editorial/service';
import { EDITORIAL_ROLES, requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Nova questão · Editorial' };

export default async function NewQuestionPage() {
  const user = await requireRole(EDITORIAL_ROLES, '/admin/questoes/nova');
  const topics = await editorialTopics(user);
  return (
    <div className="grid max-w-3xl gap-5">
      <Link href="/admin/questoes" className="text-sm">
        ← Questões
      </Link>
      <h1 className="text-3xl font-bold">Nova questão</h1>
      <p className="text-muted">Fica como rascunho até alguém da revisão aprovar e publicar.</p>
      <QuestionForm topics={topics} />
    </div>
  );
}
