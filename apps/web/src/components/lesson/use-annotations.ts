'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { lessonStudy } from '@gutta/contracts';
import { api } from '@/lib/client-api';
import type { Shape } from './geometry';

// Marcações de uma versão do material (ADR 0015): estado por página, desfazer e refazer, e
// salvamento automático alguns instantes depois do último traço, com a revisão de base.

type PageState = { layer: Shape[]; revision: number; hidden: boolean };
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const SAVE_DELAY = 1200;
const RETRY_DELAY = 5000;

/**
 * Marcações de uma versão. O componente que usa o hook leva `key` com a versão: trocar de
 * material monta um estado novo, sem resto do anterior.
 */
export function useAnnotations(materialId: string, versionId: string) {
  const [pages, setPages] = useState<Record<number, PageState>>({});
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const ref = useRef(pages);
  const dirty = useRef(new Set<number>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const saving = useRef(new Set<number>());
  const undo = useRef(new Map<number, Shape[][]>());
  const redo = useRef(new Map<number, Shape[][]>());
  const [, bump] = useState(0);
  const key = useRef({ materialId, versionId });
  const saveRef = useRef<(page: number) => Promise<void>>(async () => undefined);

  const commit = useCallback((next: Record<number, PageState>) => {
    ref.current = next;
    setPages(next);
  }, []);

  const save = useCallback(
    async (page: number) => {
      const { materialId: mid, versionId: vid } = key.current;
      if (saving.current.has(page)) return; // termina a gravação atual e regrava se preciso
      const state = ref.current[page];
      if (!state) return;
      saving.current.add(page);
      dirty.current.delete(page);
      setStatus('saving');
      try {
        const res = await api<lessonStudy.AnnotationDto>(`/materials/${mid}/annotations/${page}`, {
          method: 'PUT',
          body: {
            versionId: vid,
            baseRevision: state.revision,
            layer: state.layer,
            hidden: state.hidden,
          },
        });
        if (key.current.versionId !== vid) return;
        const cur = ref.current[page];
        if (cur) commit({ ...ref.current, [page]: { ...cur, revision: res.revision } });
        if (!dirty.current.size && saving.current.size === 1) setStatus('saved');
      } catch {
        dirty.current.add(page);
        setStatus('error');
        timers.current.set(
          page,
          setTimeout(() => {
            timers.current.delete(page);
            void saveRef.current(page);
          }, RETRY_DELAY),
        );
      } finally {
        saving.current.delete(page);
        if (dirty.current.has(page) && !timers.current.has(page)) void saveRef.current(page);
      }
    },
    [commit],
  );

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const schedule = useCallback(
    (page: number) => {
      dirty.current.add(page);
      const t = timers.current.get(page);
      if (t) clearTimeout(t);
      timers.current.set(
        page,
        setTimeout(() => {
          timers.current.delete(page);
          void save(page);
        }, SAVE_DELAY),
      );
    },
    [save],
  );

  const flush = useCallback(() => {
    for (const [page, t] of timers.current) {
      clearTimeout(t);
      timers.current.delete(page);
      void save(page);
    }
  }, [save]);

  // Carrega as marcações da versão; ao desmontar, grava o que ficou pendente.
  useEffect(() => {
    key.current = { materialId, versionId };
    let alive = true;
    api<{ items: lessonStudy.AnnotationDto[] }>(
      `/materials/${materialId}/annotations?versionId=${versionId}`,
    )
      .then((r) => {
        if (!alive) return;
        commit(
          Object.fromEntries(
            r.items.map((a) => [
              a.page,
              { layer: a.layer, revision: a.revision, hidden: a.hidden },
            ]),
          ),
        );
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
      flush();
    };
  }, [materialId, versionId, flush, commit]);

  // Ao sair da página ou esconder a aba, grava na hora (com keepalive, se for o caso).
  useEffect(() => {
    const out = () => {
      const { materialId: mid, versionId: vid } = key.current;
      for (const page of dirty.current) {
        const s = ref.current[page];
        if (!s) continue;
        void fetch(`/api/v1/materials/${mid}/annotations/${page}`, {
          method: 'PUT',
          keepalive: true,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            versionId: vid,
            baseRevision: s.revision,
            layer: s.layer,
            hidden: s.hidden,
          }),
        }).catch(() => undefined);
      }
    };
    const onHide = () => document.visibilityState === 'hidden' && out();
    window.addEventListener('pagehide', out);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', out);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  const get = useCallback(
    (page: number): PageState => ref.current[page] ?? { layer: [], revision: 0, hidden: false },
    [],
  );

  /** Troca a camada de uma página guardando o estado anterior para desfazer. */
  const setLayer = useCallback(
    (page: number, layer: Shape[]) => {
      const cur = get(page);
      const stack = undo.current.get(page) ?? [];
      stack.push(cur.layer);
      if (stack.length > 100) stack.shift();
      undo.current.set(page, stack);
      redo.current.set(page, []);
      commit({ ...ref.current, [page]: { ...cur, layer } });
      schedule(page);
    },
    [commit, get, schedule],
  );

  const step = useCallback(
    (page: number, from: Map<number, Shape[][]>, to: Map<number, Shape[][]>) => {
      const stack = from.get(page);
      const prev = stack?.pop();
      if (!prev) return;
      const cur = get(page);
      to.set(page, [...(to.get(page) ?? []), cur.layer]);
      commit({ ...ref.current, [page]: { ...cur, layer: prev } });
      schedule(page);
      bump((n) => n + 1);
    },
    [commit, get, schedule],
  );

  const setHidden = useCallback(
    (page: number, hidden: boolean) => {
      commit({ ...ref.current, [page]: { ...get(page), hidden } });
      schedule(page);
    },
    [commit, get, schedule],
  );

  return {
    loaded,
    status,
    pages,
    get,
    setLayer,
    setHidden,
    undo: (page: number) => step(page, undo.current, redo.current),
    redo: (page: number) => step(page, redo.current, undo.current),
    canUndo: (page: number) => Boolean(undo.current.get(page)?.length),
    canRedo: (page: number) => Boolean(redo.current.get(page)?.length),
    flush,
  };
}
