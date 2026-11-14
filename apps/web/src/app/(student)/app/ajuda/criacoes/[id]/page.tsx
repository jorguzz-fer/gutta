import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CreationView } from '@/components/ajuda/creation-view';
import { getCreation } from '@/features/ajuda/service';
import { requireFeature } from '@/features/flags/service';
import { ApiError } from '@/lib/api';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Criação' };

export default async function CreationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFeature('ajuda');
  const { id } = await params;
  const user = await requireStudent(`/app/ajuda/criacoes/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const creation = await getCreation(user.id, id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  return (
    <div className="grid gap-4">
      <Link href="/app/ajuda/criacoes" className="text-sm">
        Minhas criações
      </Link>
      <CreationView key={creation.updatedAt} creation={creation} />
    </div>
  );
}
