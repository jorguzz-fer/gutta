import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TutorChat } from '@/components/ajuda/tutor-chat';
import { requireFeature } from '@/features/flags/service';
import { getTutorThread } from '@/features/tutor/materials';
import { ApiError } from '@/lib/api';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Conversa com o tutor' };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function TutorThreadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFeature('ajuda');
  const { id } = await params;
  const user = await requireStudent(`/app/ajuda/tutor/${id}`);
  if (!UUID.test(id)) notFound();
  const thread = await getTutorThread(user.id, id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  return (
    <div className="grid gap-4">
      <Link href="/app/ajuda/tutor" className="text-sm">
        Tutor
      </Link>
      <TutorChat thread={thread} />
    </div>
  );
}
