import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MaterialDetail } from '@/components/materials/material-detail';
import { requireFeature } from '@/features/flags/service';
import { disciplinesForMaterials, getMaterial } from '@/features/materials/service';
import { ApiError } from '@/lib/api';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Material' };

export default async function MaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pagina?: string }>;
}) {
  await requireFeature('materiais');
  const { id } = await params;
  const user = await requireStudent(`/app/materiais/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { pagina } = await searchParams;
  const [{ material }, disciplines] = await Promise.all([
    getMaterial(user.id, id).catch((err) => {
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
        <h1 className="text-3xl md:text-4xl">{material.title}</h1>
      </div>
      <MaterialDetail
        material={material}
        disciplines={disciplines}
        page={pagina && /^\d+$/.test(pagina) ? Number(pagina) : null}
      />
    </div>
  );
}
