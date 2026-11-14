import type { Metadata } from 'next';
import Link from 'next/link';
import { CreateForm } from '@/components/ajuda/create-form';
import { CONSENT_TEXT, hasAiConsent, materialsForCreation } from '@/features/ajuda/service';
import { requireFeature } from '@/features/flags/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Criar com IA' };

const UUID = /^[0-9a-f-]{36}$/i;

// Criar com IA (SPEC v2, AJU-01; tela T24).
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ material?: string | string[] }>;
}) {
  await requireFeature('ajuda');
  const user = await requireStudent('/app/ajuda/criar');
  const sp = await searchParams;
  const initial = (Array.isArray(sp.material) ? sp.material : sp.material ? [sp.material] : [])
    .filter((m) => UUID.test(m))
    .slice(0, 20);
  const [materials, consent] = await Promise.all([
    materialsForCreation(user.id),
    hasAiConsent(user.id),
  ]);
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/app/ajuda" className="text-sm">
          Ajuda Cognuss
        </Link>
        <h1 className="text-3xl md:text-4xl">Criar com IA</h1>
      </div>
      <CreateForm
        materials={materials}
        initialMaterialIds={initial.filter((id) => materials.some((m) => m.id === id))}
        needsConsent={!consent}
        consentText={CONSENT_TEXT}
      />
    </div>
  );
}
