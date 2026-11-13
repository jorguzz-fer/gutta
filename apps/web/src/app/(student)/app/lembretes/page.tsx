import type { Metadata } from 'next';
import Link from 'next/link';
import { RemindersBoard } from '@/components/reminders/reminders-board';
import { currentDisciplines } from '@/features/academics/service';
import { userToday } from '@/features/agenda/service';
import { requireFeature } from '@/features/flags/service';
import { listReminders } from '@/features/reminders/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Meus lembretes' };

// Meus lembretes (SPEC v2, 5.11; tela T20).
export default async function RemindersPage() {
  await requireFeature('lembretes');
  const user = await requireStudent('/app/lembretes');
  const [pending, done, disciplines, today] = await Promise.all([
    listReminders(user.id, 'pendentes'),
    listReminders(user.id, 'feitos'),
    currentDisciplines(user.id),
    userToday(user.id),
  ]);
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl md:text-4xl">Meus lembretes</h1>
        <p className="text-muted">
          Tarefas, leituras, trabalhos e prazos seus. O aviso chega na antecedência que você
          escolher. <Link href="/app/avisos">Ver avisos e preferências</Link>.
        </p>
      </div>
      <RemindersBoard
        initial={pending.items}
        done={done.items.slice(0, 20)}
        disciplines={disciplines.map((d) => ({ id: d.id, name: d.name }))}
        today={today}
      />
    </div>
  );
}
