import type { Metadata } from 'next';
import Link from 'next/link';
import { ReviewSession } from '@/components/flashcards/review-session';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Revisões' };

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ modulo?: string }>;
}) {
  await requireStudent('/app/revisoes');
  const { modulo } = await searchParams;
  const moduleId = modulo && /^[0-9a-f-]{36}$/i.test(modulo) ? modulo : undefined;
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-bold">Revisões</h1>
        <Link href="/app/flashcards" className="text-sm">
          Meus cartões
        </Link>
      </div>
      <ReviewSession moduleId={moduleId} />
    </div>
  );
}
