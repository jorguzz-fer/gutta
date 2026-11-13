import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AttendanceBoard } from '@/components/attendance/attendance-board';
import { getAttendance } from '@/features/attendance/service';
import { requireFeature } from '@/features/flags/service';
import { ApiError } from '@/lib/api';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Faltas da disciplina' };

// Faltas de uma disciplina (SPEC v2, 5.12; tela T21).
export default async function DisciplineAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  await requireFeature('faltas');
  const { id } = await params;
  const user = await requireStudent(`/app/faltas/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { mes } = await searchParams;
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : undefined;
  const { attendance } = await getAttendance(user.id, id, month).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl md:text-4xl">Faltas: {attendance.disciplineName}</h1>
        <p className="text-muted">Controle pessoal de frequência.</p>
      </div>
      <AttendanceBoard initial={attendance} />
    </div>
  );
}
