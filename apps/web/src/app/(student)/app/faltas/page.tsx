import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card } from '@/components/ui/card';
import { attendanceOverview } from '@/features/attendance/service';
import { requireFeature } from '@/features/flags/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Faltas' };

const STATUS = {
  dentro: { label: 'Dentro do limite', tone: 'success' as const },
  atencao: { label: 'Perto do limite', tone: 'warn' as const },
  no_limite: { label: 'No limite', tone: 'warn' as const },
  acima: { label: 'Acima do limite', tone: 'danger' as const },
};

// Faltas de todas as disciplinas (SPEC v2, 5.12). Controle pessoal.
export default async function AttendancePage() {
  await requireFeature('faltas');
  const user = await requireStudent('/app/faltas');
  const items = await attendanceOverview(user.id);
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl md:text-4xl">Faltas</h1>
        <p className="text-muted">
          Seu controle de frequência, em horas-aula. A frequência oficial é a da instituição.
        </p>
      </div>
      {items.length === 0 ? (
        <p>Cadastre suas disciplinas para controlar as faltas.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((d) => (
            <li key={d.id}>
              <Card className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">
                    <Link href={`/app/faltas/${d.id}`}>{d.name}</Link>
                  </h2>
                  {d.summary ? (
                    <Badge tone={STATUS[d.summary.status].tone}>
                      {STATUS[d.summary.status].label}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm">
                  {d.summary
                    ? `${String(d.summary.registered).replace('.', ',')} de ${String(d.summary.limit).replace('.', ',')} horas-aula de falta permitidas (${d.summary.usedPct}% do limite).`
                    : 'Ainda sem configuração.'}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
