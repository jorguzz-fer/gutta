'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { z } from 'zod';
import type { materials } from '@gutta/contracts';
import { Button } from '@/components/ui/button';
import { AttachDialog, type AttachTarget } from './attach-dialog';

type Lesson = z.infer<typeof materials.LessonContentDto>;
type Discipline = { id: string; name: string; teachers: string[]; topics: string[] };
const DAY = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

/*
  Conteúdo de aula (SPEC v2, MAT-02, MAT-03): o cronograma em forma de planner, com os
  materiais de cada aula. Dá para anexar em aula passada.
*/
export function LessonPlanner({
  disciplineId,
  lessons,
  disciplines,
}: {
  disciplineId: string;
  lessons: Lesson[];
  disciplines: Discipline[];
}) {
  const [target, setTarget] = useState<AttachTarget | null>(null);
  if (lessons.length === 0)
    return (
      <p>
        Sem aulas no cronograma desta disciplina.{' '}
        <Link href="/app/minhas-disciplinas">Envie o cronograma</Link> ou anexe materiais pela
        biblioteca.
      </p>
    );
  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Aulas e materiais">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left">
              <th scope="col" className="p-2">
                Data
              </th>
              <th scope="col" className="p-2">
                Aula
              </th>
              <th scope="col" className="p-2">
                Tema
              </th>
              <th scope="col" className="p-2">
                Docente
              </th>
              <th scope="col" className="p-2">
                Materiais
              </th>
              <th scope="col" className="p-2">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((l) => (
              <tr key={l.lessonId} className="border-t border-line align-top">
                <td className="p-2 whitespace-nowrap">
                  {DAY.format(new Date(`${l.date}T12:00:00Z`))}
                  {l.time ? ` ${l.time}` : ''}
                </td>
                <td className="p-2">{l.title}</td>
                <td className="p-2">{l.topic ?? ''}</td>
                <td className="p-2">{l.teacher ?? ''}</td>
                <td className="p-2">
                  {l.materials.length ? (
                    <ul className="grid gap-1">
                      {l.materials.map((m) => (
                        <li key={m.id}>
                          <Link href={`/app/materiais/${m.id}`}>{m.title}</Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted">Nenhum</span>
                  )}
                </td>
                <td className="p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Anexar material à aula ${l.title}`}
                    onClick={() =>
                      setTarget({ disciplineId, lessonId: l.lessonId, lessonTitle: l.title })
                    }
                  >
                    Anexar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AttachDialog target={target} disciplines={disciplines} onClose={() => setTarget(null)} />
    </div>
  );
}
