'use client';
import { useEffect, useRef, useState } from 'react';
import type { lessonStudy } from '@gutta/contracts';
import { Button } from '@/components/ui/button';
import { ClientApiError, api } from '@/lib/client-api';
import { NoteView } from './note-view';
import type { Region } from './slide-canvas';

type Note = lessonStudy.NoteDto;
export type Slide = { materialId: string; versionId: string; page: number } | null;
/** Nota nova. Depois de salva, continua no mesmo editor (noteId), sem perder o foco. */
export type Draft = { key: string; region: Region | null; slide: Slide; noteId?: string };

const SAVE_DELAY = 1000;

function grow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.max(el.scrollHeight, 96)}px`;
}

/*
  Uma nota: escrita com linhas que crescem e salvamento automático (AUL-07, AUL-08). Rascunho
  novo só vira nota quando ganha texto.
*/
function NoteEditor({
  note,
  draft,
  lessonId,
  onSaved,
  onDeleted,
  onShowRegion,
}: {
  note: Note | null;
  draft: Draft | null;
  lessonId: string;
  onSaved: (n: Note) => void;
  onDeleted: () => void;
  onShowRegion: (r: Region, page: number | null) => void;
}) {
  const [editing, setEditing] = useState(!note);
  const [text, setText] = useState(note?.text ?? '');
  const [status, setStatus] = useState('');
  const current = useRef(note);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);

  useEffect(() => grow(area.current), [text, editing]);

  async function save() {
    timer.current = null;
    const value = textRef.current;
    const n = current.current;
    if (!n && !value.trim()) return;
    setStatus('Salvando…');
    try {
      const saved = n
        ? await api<Note>(`/notebook/${n.id}`, {
            method: 'PATCH',
            body: { text: value, baseRevision: n.revision },
          })
        : await api<Note>('/notebook', {
            method: 'POST',
            body: {
              lessonId,
              materialId: draft?.slide?.materialId ?? null,
              versionId: draft?.slide?.versionId ?? null,
              page: draft?.slide?.page ?? null,
              region: draft?.region ?? null,
              text: value,
            },
          });
      current.current = saved;
      onSaved(saved);
      setStatus('Salvo');
    } catch (err) {
      setStatus(err instanceof ClientApiError ? err.message : 'Não deu para salvar agora.');
    }
  }

  function change(v: string) {
    setText(v);
    textRef.current = v;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), SAVE_DELAY);
  }

  async function finish() {
    if (timer.current) {
      clearTimeout(timer.current);
      await save();
    }
    if (current.current || textRef.current.trim()) setEditing(false);
    else onDeleted();
  }

  async function remove() {
    if (timer.current) clearTimeout(timer.current);
    if (current.current) await api(`/notebook/${current.current.id}`, { method: 'DELETE' });
    onDeleted();
  }

  const region = note?.region ?? draft?.region ?? null;
  const id = note?.id ?? draft?.key ?? 'nova';
  return (
    <article className="grid gap-2 rounded-[var(--radius)] border border-line p-3">
      {region ? (
        <Button
          type="button"
          variant="ghost"
          className="justify-self-start px-2"
          onClick={() => onShowRegion(region, note?.page ?? draft?.slide?.page ?? null)}
        >
          Ver o trecho no slide
        </Button>
      ) : null}
      {editing ? (
        <>
          <label htmlFor={`nota-${id}`} className="sr-only">
            Texto da nota
          </label>
          <textarea
            id={`nota-${id}`}
            ref={area}
            autoFocus={!note}
            value={text}
            maxLength={20_000}
            onChange={(e) => change(e.target.value)}
            placeholder="Escreva aqui. Listas com “- ”, tabelas com “|”, negrito com “**” e fórmulas com “$”."
            className="min-h-24 w-full resize-none rounded-[var(--radius)] border border-line-strong bg-surface-2 p-2 leading-relaxed"
          />
        </>
      ) : (
        <NoteView text={text} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <Button type="button" variant="secondary" onClick={() => void finish()}>
            Pronto
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => void remove()}>
          Apagar nota
        </Button>
        <span aria-live="polite" className="text-sm text-muted">
          {status}
        </span>
      </div>
    </article>
  );
}

/*
  Caderno lateral (AUL-08, AUL-10): notas do slide aberto e as outras da aula.
*/
export function NotebookPane({
  lessonId,
  notes,
  slide,
  drafts,
  onNotes,
  onDrafts,
  onShowRegion,
  onGoTo,
}: {
  lessonId: string;
  notes: Note[];
  slide: Slide;
  drafts: Draft[];
  onNotes: (update: (prev: Note[]) => Note[]) => void;
  onDrafts: (update: (prev: Draft[]) => Draft[]) => void;
  onShowRegion: (r: Region, page: number | null) => void;
  onGoTo: (materialId: string, page: number) => void;
}) {
  const here = (n: Note) =>
    slide
      ? n.versionId === slide.versionId && n.page === slide.page
      : n.materialId === null && n.page === null;
  const fromDraft = new Set(drafts.map((d) => d.noteId).filter(Boolean));
  const mine = notes.filter((n) => here(n) && !fromDraft.has(n.id));
  const others = notes.filter((n) => !here(n));
  const upsert = (n: Note) =>
    onNotes((prev) =>
      prev.some((x) => x.id === n.id) ? prev.map((x) => (x.id === n.id ? n : x)) : [...prev, n],
    );
  const slideDrafts = drafts.filter((d) =>
    slide ? d.slide?.versionId === slide.versionId && d.slide?.page === slide.page : !d.slide,
  );
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {slide ? `Notas do slide ${slide.page}` : 'Notas da aula'}
        </h2>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onDrafts((prev) => [...prev, { key: `d${Date.now()}`, region: null, slide }])
          }
        >
          Nova nota
        </Button>
      </div>
      {mine.length === 0 && slideDrafts.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhuma nota aqui ainda. Use “Nova nota” ou a ferramenta “Trecho” para ligar uma nota a
          uma parte do slide.
        </p>
      ) : null}
      {mine.map((n) => (
        <NoteEditor
          key={n.id}
          note={n}
          draft={null}
          lessonId={lessonId}
          onSaved={upsert}
          onDeleted={() => onNotes((prev) => prev.filter((x) => x.id !== n.id))}
          onShowRegion={onShowRegion}
        />
      ))}
      {slideDrafts.map((d) => (
        <NoteEditor
          key={d.key}
          note={null}
          draft={d}
          lessonId={lessonId}
          onSaved={(n) => {
            onDrafts((prev) => prev.map((x) => (x.key === d.key ? { ...x, noteId: n.id } : x)));
            upsert(n);
          }}
          onDeleted={() => {
            onDrafts((prev) => prev.filter((x) => x.key !== d.key));
            if (d.noteId) onNotes((prev) => prev.filter((x) => x.id !== d.noteId));
          }}
          onShowRegion={onShowRegion}
        />
      ))}
      {others.length ? (
        <details className="rounded-[var(--radius)] border border-line p-3">
          <summary className="cursor-pointer font-semibold">
            Outras notas desta aula ({others.length})
          </summary>
          <ul className="mt-2 grid gap-2">
            {others.map((n) => (
              <li key={n.id} className="grid gap-1">
                {n.materialId && n.page ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-self-start px-2"
                    onClick={() => onGoTo(n.materialId!, n.page!)}
                  >
                    Ir ao slide {n.page}
                    {n.materialTitle ? ` de ${n.materialTitle}` : ''}
                  </Button>
                ) : (
                  <span className="text-sm text-muted">Sem slide</span>
                )}
                <NoteView text={n.text} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
