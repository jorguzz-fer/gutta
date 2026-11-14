import type { Metadata } from 'next';
import Link from 'next/link';
import { PreferencesForm } from '@/components/planning/preferences-form';
import { requireFeature } from '@/features/flags/service';
import { getPreferences } from '@/features/planning/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Preferências do Equilíbrio' };

// Preferências do Equilíbrio (SPEC v2, EQU-01 a EQU-04; tela T06).
export default async function PlanningPreferencesPage() {
  await requireFeature('equilibrio');
  const user = await requireStudent('/app/equilibrio/preferencias');
  const prefs = await getPreferences(user.id);
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/app/equilibrio" className="text-sm">
          Equilíbrio
        </Link>
        <h1 className="text-3xl md:text-4xl">Como você prefere organizar seus estudos?</h1>
      </div>
      <PreferencesForm initial={prefs} />
    </div>
  );
}
