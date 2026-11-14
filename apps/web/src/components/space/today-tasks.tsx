'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client-api';
import { cn } from '@/lib/cn';

type Task = { id: string; title: string; start: string | null; done: boolean };

/** Tarefas de hoje (ESP-03): os lembretes com data de hoje, com marcação e contador. */
export function TodayTasks({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const [state, setState] = useState(tasks);
  const done = state.filter((t) => t.done).length;
  async function toggle(t: Task) {
    setState((cur) => cur.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    try {
      await api(`/reminders/${t.id}/done`, { method: 'POST', body: { done: !t.done } });
      router.refresh();
    } catch {
      setState((cur) => cur.map((x) => (x.id === t.id ? { ...x, done: t.done } : x)));
    }
  }
  return (
    <div className="grid gap-2">
      <h3 className="text-base font-semibold">
        Tarefas de hoje{' '}
        <span className="font-normal text-muted">
          ({done}/{state.length})
        </span>
      </h3>
      <ul className="grid gap-1">
        {state.map((t) => (
          <li key={t.id}>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={t.done}
                onChange={() => toggle(t)}
              />
              <span className={cn(t.done && 'text-muted line-through')}>
                {t.start ? `${t.start} · ` : ''}
                {t.title}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
