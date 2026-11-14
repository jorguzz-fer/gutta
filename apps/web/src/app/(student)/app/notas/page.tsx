import { formatGrade } from '@gutta/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card } from '@/components/ui/card';
import { requireFeature } from '@/features/flags/service';
import { gradesOverview } from '@/features/grades/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Notas' };

// Notas de todas as disciplinas (SPEC v2, 5.13). Acompanhamento pessoal.
export default async function GradesPage() {
  await requireFeature('notas');
  const user = await requireStudent('/app/notas');
  const items = await gradesOverview(user.id);
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl md:text-4xl">Notas</h1>
        <p className="text-muted">
          Médias e quanto falta em cada disciplina. O registro oficial é o da instituição.
        </p>
      </div>
      {items.length === 0 ? (
        <p>Cadastre suas disciplinas para acompanhar as notas.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((d) => (
            <li key={d.disciplineId}>
              <Card className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">
                    <Link href={`/app/notas/${d.disciplineId}`}>{d.disciplineName}</Link>
                  </h2>
                  {d.atRisk ? <Badge tone="warn">Em risco</Badge> : null}
                </div>
                <p className="text-sm">
                  {d.summary.current === null
                    ? 'Nenhuma nota lançada.'
                    : `Média atual ${formatGrade(d.summary.current)} (mínima ${formatGrade(d.scheme.minGrade)}), ${d.summary.graded} de ${d.summary.graded + d.summary.pending} avaliações lançadas.`}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
