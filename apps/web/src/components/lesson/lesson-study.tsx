'use client';
import {
  ArrowRight,
  Circle,
  Eraser,
  EyeOff,
  History,
  Hand,
  Highlighter,
  Maximize,
  Minus,
  Pen,
  Plus,
  Redo2,
  Scan,
  Slash,
  Square,
  Type,
  Undo2,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Star,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { lessonStudy } from '@gutta/contracts';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/card';
import {
  AttachDialog,
  ORIGIN_LABEL,
  type AttachTarget,
} from '@/components/materials/attach-dialog';
import { api } from '@/lib/client-api';
import { uploadFile } from '@/lib/upload';
import { cn } from '@/lib/cn';
import { shapeId } from './geometry';
import { HistoryDialog } from './history-dialog';
import { LearningPanel } from './learning-panel';
import { NotebookPane, type Draft, type Slide } from './notebook-pane';
import { openPdf, type PDFDocumentProxy } from './pdf';
import { ReassociateDialog } from './reassociate-dialog';
import { SlideCanvas, type Region, type Tool, type WidthKey } from './slide-canvas';
import { useAnnotations } from './use-annotations';

type Study = lessonStudy.LessonStudyDto;
type Discipline = { id: string; name: string; teachers: string[]; topics: string[] };

const TOOLS: [Tool, string, typeof Pen][] = [
  ['navegar', 'Navegar', Hand],
  ['pen', 'Caneta', Pen],
  ['marker', 'Marca-texto', Highlighter],
  ['eraser', 'Borracha', Eraser],
  ['line', 'Linha', Slash],
  ['arrow', 'Seta', ArrowRight],
  ['rect', 'Retângulo', Square],
  ['ellipse', 'Círculo', Circle],
  ['text', 'Texto', Type],
  ['regiao', 'Trecho: ligar uma nota a uma parte do slide', Scan],
];
const COLORS: [string, string][] = [
  ['#c2181d', 'Vermelho'],
  ['#1d4ed8', 'Azul'],
  ['#047857', 'Verde'],
  ['#6d28d9', 'Roxo'],
  ['#111827', 'Preto'],
  ['#facc15', 'Amarelo'],
];
const WIDTHS: [WidthKey, string][] = [
  ['fino', 'Fino'],
  ['medio', 'Médio'],
  ['grosso', 'Grosso'],
];
const ZOOMS = [0.75, 1, 1.25, 1.5, 2];
const SAVE_TEXT = {
  idle: '',
  saving: 'Salvando…',
  saved: 'Salvo',
  error: 'Sem conexão. Vamos tentar de novo.',
} as const;

function Thumb({
  fileId,
  page,
  current,
  starred,
  onClick,
}: {
  fileId: string;
  page: number;
  current: boolean;
  starred: boolean;
  onClick: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ url: string }>(`/files/${fileId}/url?variant=thumbnail&page=${page}`)
      .then((r) => alive && setSrc(r.url))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [fileId, page]);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? 'page' : undefined}
      aria-label={`Slide ${page}${starred ? ', marcado como importante' : ''}`}
      className={cn(
        'relative block w-24 shrink-0 rounded-[var(--radius)] border-2 p-0.5 lg:w-full',
        current ? 'border-accent' : 'border-transparent hover:border-line-strong',
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full rounded-[2px] bg-white" />
      ) : (
        <span className="grid aspect-[4/3] place-items-center bg-surface-2 text-xs">{page}</span>
      )}
      <span className="absolute bottom-1 left-1 rounded-[2px] bg-black/70 px-1 text-xs text-white">
        {page}
      </span>
      {starred ? (
        <Star aria-hidden className="absolute right-1 top-1 size-4 fill-amber-400 text-amber-600" />
      ) : null}
    </button>
  );
}

type Shared = {
  lesson: Study['lesson'];
  materials: Study['materials'];
  notes: lessonStudy.NoteDto[];
  setNotes: React.Dispatch<React.SetStateAction<lessonStudy.NoteDto[]>>;
  drafts: Draft[];
  setDrafts: React.Dispatch<React.SetStateAction<Draft[]>>;
  marks: lessonStudy.MarkDto[];
  setMarks: (m: lessonStudy.MarkDto[]) => void;
  progress: lessonStudy.ProgressDto;
  setProgress: (p: lessonStudy.ProgressDto) => void;
  tab: 'caderno' | 'aula';
  setTab: (t: 'caderno' | 'aula') => void;
  pageLabel: (m: lessonStudy.MarkDto) => string;
  onSwitch: (materialId: string, page: number) => void;
  tutor: boolean;
};

/*
  Área de um material: miniaturas, slide com marcações e painel. Montada de novo a cada
  material ou versão (key), com o estado das marcações limpo.
*/
function Workspace({
  material,
  initialPage,
  lesson: l,
  notes,
  setNotes,
  drafts,
  setDrafts,
  marks,
  setMarks,
  progress,
  setProgress,
  tab,
  setTab,
  pageLabel,
  onSwitch,
  tutor,
}: Shared & { material: Study['materials'][number]; initialPage: number }) {
  const pageCount = material.file.pageCount ?? 0;
  const [page, setPage] = useState(() =>
    Math.min(Math.max(1, initialPage), Math.max(1, pageCount)),
  );
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [docError, setDocError] = useState('');
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]![0]);
  const [width, setWidth] = useState<WidthKey>('medio');
  const [zoom, setZoom] = useState(1);
  const [highlight, setHighlight] = useState<Region | null>(null);
  const [imageStatus, setImageStatus] = useState('');
  const [history, setHistory] = useState(false);
  const viewer = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const ann = useAnnotations(material.id, material.versionId);
  const { flush } = ann;
  const current = ann.get(page);
  const slide: Slide = { materialId: material.id, versionId: material.versionId, page };

  // Abre o PDF do material (o original, ou o PDF convertido do PowerPoint).
  const fileId = material.file.id;
  const fileReady = material.file.status === 'ready';
  const variant = material.file.kind === 'pdf' ? 'original' : 'pdf';
  useEffect(() => {
    if (!fileReady) return;
    let alive = true;
    let close: (() => void) | null = null;
    api<{ url: string }>(`/files/${fileId}/url?variant=${variant}`)
      .then((r) => openPdf(r.url))
      .then((o) => {
        close = o.close;
        if (alive) setDoc(o.doc);
        else o.close();
      })
      .catch(() => alive && setDocError('Não deu para abrir o arquivo agora. Tente recarregar.'));
    return () => {
      alive = false;
      close?.();
    };
  }, [fileId, fileReady, variant]);

  // Continuidade entre aparelhos (AUL-26): guarda onde o aluno parou.
  useEffect(() => {
    const t = setTimeout(() => {
      void api(`/lessons/${l.id}/progress`, {
        method: 'PUT',
        body: { lastMaterialId: material.id, lastPage: page },
      }).catch(() => undefined);
    }, 2000);
    return () => clearTimeout(t);
  }, [l.id, material.id, page]);

  const go = useCallback(
    (p: number) => {
      flush();
      setHighlight(null);
      setPage(Math.min(Math.max(1, p), Math.max(1, pageCount)));
    },
    [flush, pageCount],
  );

  // Setas do teclado trocam de slide, fora dos campos de texto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(page + 1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(page - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, page]);

  const starred = useMemo(
    () =>
      new Set(
        marks
          .filter(
            (m) =>
              m.targetType === 'slide' &&
              m.versionId === material.versionId &&
              m.importance !== 'nenhuma',
          )
          .map((m) => m.page),
      ),
    [marks, material.versionId],
  );

  const goTo = (materialId: string | null, p: number | null, region?: Region | null) => {
    if (materialId && materialId !== material.id) {
      onSwitch(materialId, p ?? 1);
      return;
    }
    if (p && p !== page) go(p);
    if (region) setHighlight(region);
  };

  async function addImage(file: File) {
    setImageStatus('Enviando a imagem…');
    try {
      const up = await uploadFile(file, () => undefined);
      ann.setLayer(page, [
        ...ann.get(page).layer,
        { id: shapeId(), kind: 'image', x: 0.3, y: 0.3, w: 0.4, h: 0.3, fileId: up.id },
      ]);
      setImageStatus('');
    } catch {
      setImageStatus('Não deu para enviar a imagem agora.');
    }
  }

  const label = `Slide ${page} de ${pageCount} de ${material.title}, com suas marcações`;

  return (
    <div className="grid gap-4 lg:grid-cols-[7rem_minmax(0,1fr)_22rem]">
      {/* Navegador de slides: miniaturas com a marca dos importantes. */}
      <nav
        aria-label="Slides"
        className="order-2 flex gap-2 overflow-x-auto pb-2 lg:order-1 lg:max-h-[80vh] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden"
      >
        {Array.from({ length: Math.min(pageCount, 300) }, (_, i) => (
          <Thumb
            key={i}
            fileId={material.file.id}
            page={i + 1}
            current={page === i + 1}
            starred={starred.has(i + 1)}
            onClick={() => go(i + 1)}
          />
        ))}
      </nav>

      {/* Área central: PDF e ferramentas. */}
      <section
        ref={viewer}
        aria-label="Slide e ferramentas"
        className="order-1 grid content-start gap-2 bg-bg lg:order-2"
      >
        <div
          role="toolbar"
          aria-label="Ferramentas de marcação"
          className="flex flex-wrap items-center gap-1 rounded-[var(--radius)] border border-line bg-surface p-1"
        >
          {TOOLS.map(([k, name, Icon]) => (
            <button
              key={k}
              type="button"
              title={name}
              aria-label={name}
              aria-pressed={tool === k}
              onClick={() => setTool(k)}
              className={cn(
                'grid size-11 place-items-center rounded-[var(--radius)]',
                tool === k ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2',
              )}
            >
              <Icon className="size-5" aria-hidden />
            </button>
          ))}
          <button
            type="button"
            title="Inserir imagem"
            aria-label="Inserir imagem"
            onClick={() => imageInput.current?.click()}
            className="grid size-11 place-items-center rounded-[var(--radius)] hover:bg-surface-2"
          >
            <ImagePlus className="size-5" aria-hidden />
          </button>
          <input
            ref={imageInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void addImage(f);
            }}
          />
          <span className="mx-1 h-8 w-px bg-line" aria-hidden />
          <div role="group" aria-label="Cor" className="flex gap-1">
            {COLORS.map(([c, name]) => (
              <button
                key={c}
                type="button"
                aria-label={name}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cn(
                  'grid size-11 place-items-center rounded-[var(--radius)]',
                  color === c ? 'ring-2 ring-accent' : 'hover:bg-surface-2',
                )}
              >
                <span
                  className="size-6 rounded-full border border-black/20"
                  style={{ background: c }}
                />
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="espessura">
            Espessura
          </label>
          <select
            id="espessura"
            value={width}
            onChange={(e) => setWidth(e.target.value as WidthKey)}
            className="min-h-11 rounded-[var(--radius)] border border-line bg-surface-2 px-2 text-sm"
          >
            {WIDTHS.map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
          <span className="mx-1 h-8 w-px bg-line" aria-hidden />
          <button
            type="button"
            aria-label="Desfazer"
            title="Desfazer"
            disabled={!ann.canUndo(page)}
            onClick={() => ann.undo(page)}
            className="grid size-11 place-items-center rounded-[var(--radius)] hover:bg-surface-2 disabled:opacity-40"
          >
            <Undo2 className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Refazer"
            title="Refazer"
            disabled={!ann.canRedo(page)}
            onClick={() => ann.redo(page)}
            className="grid size-11 place-items-center rounded-[var(--radius)] hover:bg-surface-2 disabled:opacity-40"
          >
            <Redo2 className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Ocultar marcações deste slide"
            title="Ocultar marcações deste slide"
            aria-pressed={current.hidden}
            onClick={() => ann.setHidden(page, !current.hidden)}
            className={cn(
              'grid size-11 place-items-center rounded-[var(--radius)]',
              current.hidden ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2',
            )}
          >
            <EyeOff className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Histórico das marcações deste slide"
            title="Histórico das marcações deste slide"
            onClick={() => {
              flush();
              setHistory(true);
            }}
            className="grid size-11 place-items-center rounded-[var(--radius)] hover:bg-surface-2"
          >
            <History className="size-5" aria-hidden />
          </button>
          <span aria-live="polite" className="ml-auto px-2 text-sm text-muted">
            {imageStatus || SAVE_TEXT[ann.status]}
          </span>
        </div>
        {docError ? (
          <Alert tone="danger" role="alert">
            {docError}
          </Alert>
        ) : material.file.status !== 'ready' ? (
          <Alert>O arquivo ainda está sendo preparado. Volte em instantes.</Alert>
        ) : pageCount === 0 ? (
          <Alert>Este arquivo não tem páginas para mostrar.</Alert>
        ) : (
          <SlideCanvas
            doc={doc}
            page={page}
            zoom={zoom}
            layer={current.layer}
            hidden={current.hidden}
            tool={tool}
            color={color}
            width={width}
            highlight={highlight}
            label={label}
            onLayer={(next) => ann.setLayer(page, next)}
            onRegion={(region) => {
              setDrafts((prev) => [...prev, { key: `d${Date.now()}`, region, slide }]);
              setTab('caderno');
              setTool('navegar');
            }}
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              aria-label="Slide anterior"
              disabled={page <= 1}
              onClick={() => go(page - 1)}
            >
              <ChevronLeft className="size-5" aria-hidden />
            </Button>
            <p aria-live="polite" className="min-w-16 text-center font-semibold">
              {page} de {pageCount}
            </p>
            <Button
              type="button"
              variant="secondary"
              aria-label="Próximo slide"
              disabled={page >= pageCount}
              onClick={() => go(page + 1)}
            >
              <ChevronRight className="size-5" aria-hidden />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              aria-label="Diminuir o zoom"
              disabled={zoom <= ZOOMS[0]!}
              onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)]!)}
            >
              <Minus className="size-5" aria-hidden />
            </Button>
            <span className="min-w-12 text-center text-sm">{Math.round(zoom * 100)}%</span>
            <Button
              type="button"
              variant="secondary"
              aria-label="Aumentar o zoom"
              disabled={zoom >= ZOOMS[ZOOMS.length - 1]!}
              onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)]!)}
            >
              <Plus className="size-5" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="secondary"
              aria-label="Tela cheia"
              onClick={() => {
                const el = viewer.current;
                if (document.fullscreenElement) void document.exitFullscreen();
                else void el?.requestFullscreen?.().catch(() => undefined);
              }}
            >
              <Maximize className="size-5" aria-hidden />
            </Button>
          </div>
        </div>
      </section>

      {/* Caderno lateral e painel de aprendizagem. */}
      <aside className="order-3 grid content-start gap-3">
        <div role="tablist" aria-label="Painel" className="grid grid-cols-2 gap-1">
          {(
            [
              ['caderno', 'Caderno'],
              ['aula', 'Aula'],
            ] as const
          ).map(([k, n]) => (
            <button
              key={k}
              id={`aba-${k}`}
              type="button"
              role="tab"
              aria-selected={tab === k}
              aria-controls={`painel-${k}`}
              onClick={() => setTab(k)}
              className={cn(
                'min-h-11 rounded-[var(--radius)] border font-semibold',
                tab === k ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div
          id="painel-caderno"
          role="tabpanel"
          aria-labelledby="aba-caderno"
          hidden={tab !== 'caderno'}
        >
          <NotebookPane
            lessonId={l.id}
            notes={notes}
            slide={slide}
            drafts={drafts}
            onNotes={setNotes}
            onDrafts={setDrafts}
            onShowRegion={(r, p) => goTo(null, p, r)}
            onGoTo={(mid, p) => goTo(mid, p)}
          />
        </div>
        <div id="painel-aula" role="tabpanel" aria-labelledby="aba-aula" hidden={tab !== 'aula'}>
          <LearningPanel
            tutor={tutor}
            lessonId={l.id}
            disciplineId={l.disciplineId}
            slide={slide}
            marks={marks}
            progress={progress}
            pageLabel={pageLabel}
            onMark={(m) =>
              setMarks(
                marks.some((x) => x.id === m.id)
                  ? marks.map((x) => (x.id === m.id ? m : x))
                  : [...marks, m],
              )
            }
            onProgress={setProgress}
            onGoTo={(m) => goTo(m.materialId, m.page, m.region)}
          />
        </div>
      </aside>
      <HistoryDialog
        materialId={material.id}
        versionId={material.versionId}
        page={page}
        open={history}
        onClose={() => setHistory(false)}
        onRestored={(a) => {
          ann.replace(a.page, a);
          setHistory(false);
        }}
      />
    </div>
  );
}

/*
  Acompanhar Aula (SPEC v2, 5.7; ADR 0015): barra superior, miniaturas, slide com marcações,
  caderno lateral e painel de aprendizagem.
*/
export function LessonStudy({
  study,
  disciplines,
  initialMaterialId,
  initialPage,
  tutor = false,
}: {
  study: Study;
  disciplines: Discipline[];
  initialMaterialId: string | null;
  initialPage: number | null;
  tutor?: boolean;
}) {
  const router = useRouter();
  const l = study.lesson;
  const startMaterial =
    study.materials.find((m) => m.id === initialMaterialId) ??
    study.materials.find((m) => m.id === study.progress.lastMaterialId) ??
    study.materials[0] ??
    null;
  const [materialId, setMaterialId] = useState<string | null>(startMaterial?.id ?? null);
  const [startPage, setStartPage] = useState(
    () =>
      initialPage ??
      (startMaterial && startMaterial.id === study.progress.lastMaterialId
        ? study.progress.lastPage
        : null) ??
      1,
  );
  const material = study.materials.find((m) => m.id === materialId) ?? null;
  const [notes, setNotes] = useState(study.notes);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [marks, setMarks] = useState(study.marks);
  const [progress, setProgress] = useState(study.progress);
  const [tab, setTab] = useState<'caderno' | 'aula'>('caderno');
  const [attach, setAttach] = useState<AttachTarget | null>(null);
  const [reassociate, setReassociate] = useState(false);

  const onSwitch = (id: string, page: number) => {
    setMaterialId(id);
    setStartPage(page);
  };
  const pageLabel = (m: lessonStudy.MarkDto) => {
    const mt = study.materials.find((x) => x.id === m.materialId);
    const many = study.materials.length > 1 && mt ? ` de ${mt.title}` : '';
    return m.page ? `Slide ${m.page}${many}` : 'Tema';
  };
  const momentLabel = { antes: 'Antes da aula', durante: 'Aula agora', depois: 'Depois da aula' };
  const shared: Shared = {
    lesson: l,
    materials: study.materials,
    notes,
    setNotes,
    drafts,
    setDrafts,
    marks,
    setMarks,
    progress,
    setProgress,
    tab,
    setTab,
    pageLabel,
    onSwitch,
    tutor,
  };

  return (
    <div className="grid gap-4">
      {/* Barra superior: disciplina, tema, data, horário, docentes e estado da aula. */}
      <header className="grid gap-1">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          {l.disciplineName}
        </p>
        <h1 className="text-2xl md:text-3xl">{l.title}</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>
            {new Date(`${l.date}T12:00:00`).toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: '2-digit',
              month: '2-digit',
            })}
            {l.start ? `, ${l.start}${l.end ? ` às ${l.end}` : ''}` : ''}
          </span>
          {l.topic ? <span>Tema: {l.topic}</span> : null}
          {l.teachers.length ? <span>{l.teachers.join(', ')}</span> : null}
          {l.location ? <span>{l.location}</span> : null}
          <Badge tone={l.moment === 'durante' ? 'accent' : 'neutral'}>
            {progress.concludedAt ? 'Concluída' : momentLabel[l.moment]}
          </Badge>
        </p>
      </header>

      {study.materials.length === 0 ? (
        <Alert>
          <p>Anexe os slides desta aula para marcar, escrever e tomar notas por cima deles.</p>
          <div className="mt-3">
            <Button
              type="button"
              onClick={() =>
                setAttach({ disciplineId: l.disciplineId, lessonId: l.id, lessonTitle: l.title })
              }
            >
              Anexar slides
            </Button>
          </div>
        </Alert>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {study.materials.length > 1 ? (
            <>
              <label htmlFor="material" className="text-sm font-semibold">
                Material
              </label>
              <select
                id="material"
                value={materialId ?? ''}
                onChange={(e) => onSwitch(e.target.value, 1)}
                className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2"
              >
                {study.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p className="font-semibold">{material?.title}</p>
          )}
          {material ? <Badge tone="neutral">{ORIGIN_LABEL[material.origin]}</Badge> : null}
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setAttach({ disciplineId: l.disciplineId, lessonId: l.id, lessonTitle: l.title })
            }
          >
            Anexar outro material
          </Button>
        </div>
      )}

      {material?.olderAnnotations ? (
        <Alert>
          <p>
            Este material ganhou uma versão nova. Suas marcações e notas continuam guardadas na
            versão anterior.
          </p>
          <div className="mt-3">
            <Button type="button" variant="secondary" onClick={() => setReassociate(true)}>
              Levar para a versão nova
            </Button>
          </div>
        </Alert>
      ) : null}

      {material ? (
        <Workspace
          key={material.versionId}
          {...shared}
          material={material}
          initialPage={startPage}
        />
      ) : (
        <LearningPanel
          tutor={tutor}
          lessonId={l.id}
          disciplineId={l.disciplineId}
          slide={null}
          marks={marks}
          progress={progress}
          pageLabel={pageLabel}
          onMark={() => undefined}
          onProgress={setProgress}
          onGoTo={() => undefined}
        />
      )}

      <AttachDialog target={attach} disciplines={disciplines} onClose={() => setAttach(null)} />
      {material ? (
        <ReassociateDialog
          materialId={material.id}
          pageCount={material.file.pageCount ?? 0}
          open={reassociate}
          onClose={() => setReassociate(false)}
          onDone={() => {
            setReassociate(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
