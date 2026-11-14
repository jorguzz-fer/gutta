import type { Metadata } from 'next';
import Link from 'next/link';
import { TutorStart } from '@/components/ajuda/tutor-start';
import { Card } from '@/components/ui/card';
import { hasAiConsent, materialsForCreation } from '@/features/ajuda/service';
import { requireFeature } from '@/features/flags/service';
import { listTutorThreads, TUTOR_CONSENT_TEXT, tutorPresetLabel } from '@/features/tutor/materials';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Tutor' };

const UUID = /^[0-9a-f-]{36}$/i;
const SCOPE_LABEL = { materiais: 'Materiais', aula: 'Aula', slide: 'Slide' } as const;

// Tutor sobre os materiais (SPEC v2, AJU-08, AUL-17). Vindo da aula, a fonte já vem escolhida.
export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{ escopo?: string; aula?: string; material?: string; pagina?: string }>;
}) {
  await requireFeature('ajuda');
  const user = await requireStudent('/app/ajuda/tutor');
  const sp = await searchParams;
  const lessonId = sp.aula && UUID.test(sp.aula) ? sp.aula : undefined;
  const materialId = sp.material && UUID.test(sp.material) ? sp.material : undefined;
  const page = sp.pagina && /^\d{1,4}$/.test(sp.pagina) ? Number(sp.pagina) : undefined;
  const scope: 'aula' | 'slide' | null =
    sp.escopo === 'aula' || sp.escopo === 'slide' ? sp.escopo : null;
  const [materials, consent, threads, presetLabel] = await Promise.all([
    materialsForCreation(user.id),
    hasAiConsent(user.id),
    listTutorThreads(user.id),
    scope ? tutorPresetLabel(user.id, { scope, lessonId, materialId, page }) : null,
  ]);
  const preset =
    scope && presetLabel ? { scope, lessonId, materialId, page, label: presetLabel } : null;
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/app/ajuda" className="text-sm">
          Ajuda Cognuss
        </Link>
        <h1 className="text-3xl md:text-4xl">Tutor</h1>
        <p className="text-muted">
          Pergunte sobre os seus materiais. A resposta mostra a página de onde saiu e avisa quando
          os materiais não cobrem o assunto.
        </p>
      </div>
      <TutorStart
        materials={materials}
        preset={preset}
        needsConsent={!consent}
        consentText={TUTOR_CONSENT_TEXT}
      />
      <Card as="section" aria-labelledby="conversas" className="grid gap-3">
        <h2 id="conversas" className="text-lg font-semibold">
          Conversas recentes
        </h2>
        {threads.items.length === 0 ? (
          <p className="text-sm text-muted">As conversas com o tutor ficam guardadas aqui.</p>
        ) : (
          <ul className="grid gap-2">
            {threads.items.map((t) => (
              <li key={t.id} className="flex flex-wrap justify-between gap-2">
                <Link href={`/app/ajuda/tutor/${t.id}`}>{t.title}</Link>
                <span className="text-sm text-muted">{SCOPE_LABEL[t.scope]}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
