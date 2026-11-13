'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { materials } from '@gutta/contracts';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { ClientApiError, api } from '@/lib/client-api';
import { uploadFile } from '@/lib/upload';

type Discipline = { id: string; name: string; teachers: string[]; topics: string[] };
export type AttachTarget = {
  disciplineId?: string;
  lessonId?: string;
  lessonTitle?: string;
  /** Nova versão de um material existente (MAT-16). */
  materialId?: string;
};

export const ORIGIN_LABEL: Record<materials.MaterialDto['origin'], string> = {
  professor: 'Do professor',
  pessoal: 'Pessoal',
  colega: 'De colega',
  cognuss: 'Produzido pela Cognuss',
  internet: 'Da internet',
};
export const TYPE_LABEL: Record<materials.MaterialDto['type'], string> = {
  estudo: 'Material de estudo',
  atividade: 'Atividade',
  prova: 'Prova',
};
const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.odt,.odp,.png,.jpg,.jpeg,.webp,application/pdf,image/*';

/*
  Anexar material (SPEC v2, MAT-04, MAT-05, MAT-07): disciplina, tipo e título obrigatórios;
  aula, tema, docente e origem opcionais. Tema e docente vêm em listas com o que já existe,
  com opção de digitar.
*/
export function AttachDialog({
  target,
  disciplines,
  onClose,
}: {
  target: AttachTarget | null;
  disciplines: Discipline[];
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: '',
    type: 'estudo' as materials.MaterialDto['type'],
    origin: 'professor' as materials.MaterialDto['origin'],
    disciplineId: '',
    topic: '',
    teacher: '',
  });
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (target) ref.current?.showModal?.();
    else ref.current?.close?.();
  }, [target]);

  const disciplineId = target?.disciplineId ?? form.disciplineId;
  const disc = disciplines.find((d) => d.id === disciplineId);
  const versionOnly = Boolean(target?.materialId);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!file || !target) return;
    setError('');
    try {
      const uploaded = await uploadFile(file, (p) =>
        setStage(
          p.stage === 'hashing'
            ? 'Preparando…'
            : p.stage === 'uploading'
              ? `Enviando… ${Math.round((p.loaded / p.total) * 100)}%`
              : 'Verificando o arquivo…',
        ),
      );
      if (target.materialId) {
        await api(`/materials/${target.materialId}/versions`, {
          method: 'POST',
          body: { fileId: uploaded.id },
        });
      } else {
        await api('/materials', {
          method: 'POST',
          body: {
            fileId: uploaded.id,
            title: form.title || file.name.replace(/\.[^.]+$/, ''),
            type: form.type,
            origin: form.origin,
            disciplineId,
            lessonId: target.lessonId ?? null,
            topic: form.topic || null,
            teacher: form.teacher || null,
          },
        });
      }
      setStage('');
      setFile(null);
      onClose();
      router.refresh();
    } catch (err) {
      setStage('');
      setError(err instanceof ClientApiError ? err.message : 'Não deu para anexar agora.');
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="anexar-titulo"
      onClose={onClose}
      className="w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius)] border border-line bg-surface p-0 text-fg backdrop:bg-black/50"
    >
      {target ? (
        <form onSubmit={submit} className="grid gap-4 p-5">
          <h2 id="anexar-titulo" className="text-xl font-semibold">
            {versionOnly ? 'Enviar nova versão' : 'Anexar material'}
          </h2>
          {target.lessonTitle ? <p className="text-sm">Aula: {target.lessonTitle}</p> : null}
          <Field label="Arquivo" hint="PDF, Word, PowerPoint ou imagem, até 50 MB.">
            {(p) => (
              <Input
                {...p}
                type="file"
                accept={ACCEPT}
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            )}
          </Field>
          {!versionOnly ? (
            <>
              <Field label="Título" hint="Vazio: o nome do arquivo.">
                {(p) => (
                  <Input
                    {...p}
                    maxLength={200}
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                )}
              </Field>
              {!target.disciplineId ? (
                <Field label="Disciplina">
                  {(p) => (
                    <Select
                      {...p}
                      required
                      value={form.disciplineId}
                      onChange={(e) => setForm({ ...form, disciplineId: e.target.value })}
                    >
                      <option value="">Escolha a disciplina</option>
                      {disciplines.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo">
                  {(p) => (
                    <Select
                      {...p}
                      value={form.type}
                      onChange={(e) =>
                        setForm({ ...form, type: e.target.value as typeof form.type })
                      }
                    >
                      {Object.entries(TYPE_LABEL).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Origem">
                  {(p) => (
                    <Select
                      {...p}
                      value={form.origin}
                      onChange={(e) =>
                        setForm({ ...form, origin: e.target.value as typeof form.origin })
                      }
                    >
                      {Object.entries(ORIGIN_LABEL)
                        .filter(([k]) => k !== 'cognuss')
                        .map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                    </Select>
                  )}
                </Field>
                <Field label="Tema" optional>
                  {(p) => (
                    <>
                      <Input
                        {...p}
                        list="temas"
                        maxLength={120}
                        value={form.topic}
                        onChange={(e) => setForm({ ...form, topic: e.target.value })}
                      />
                      <datalist id="temas">
                        {disc?.topics.map((t) => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                    </>
                  )}
                </Field>
                <Field label="Professor" optional>
                  {(p) => (
                    <>
                      <Input
                        {...p}
                        list="docentes"
                        maxLength={120}
                        value={form.teacher}
                        onChange={(e) => setForm({ ...form, teacher: e.target.value })}
                      />
                      <datalist id="docentes">
                        {disc?.teachers.map((t) => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                    </>
                  )}
                </Field>
              </div>
            </>
          ) : null}
          {stage ? <p aria-live="polite">{stage}</p> : null}
          {error ? (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={Boolean(stage) || !file}>
              {versionOnly ? 'Enviar versão' : 'Anexar'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
