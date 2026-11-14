'use client';
import { useEffect, useState } from 'react';
import type { materials } from '@gutta/contracts';
import { DownloadButton } from '@/components/files/download-button';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { api } from '@/lib/client-api';
import { AttachDialog, ORIGIN_LABEL, TYPE_LABEL, type AttachTarget } from './attach-dialog';

type Material = materials.MaterialDto;
type Discipline = { id: string; name: string; teachers: string[]; topics: string[] };
const WHEN = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Miniatura de uma página pela URL assinada de vida curta. */
function Thumb({ fileId, page, focus }: { fileId: string; page: number; focus: boolean }) {
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
    <figure
      id={`pagina-${page}`}
      className={focus ? 'rounded-[var(--radius)] ring-2 ring-accent' : undefined}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`Página ${page}`}
          className="w-full rounded-[var(--radius)] border border-line"
        />
      ) : (
        <div className="grid aspect-[3/4] place-items-center rounded-[var(--radius)] border border-line text-sm text-muted">
          Página {page}
        </div>
      )}
      <figcaption className="text-center text-xs text-muted">Página {page}</figcaption>
    </figure>
  );
}

/*
  Um material (SPEC v2, MAT-15, MAT-16, MAT-19): procedência, vínculos, páginas, versões e o
  original para baixar. O arquivo original nunca é alterado.
*/
export function MaterialDetail({
  material: m,
  disciplines,
  page,
}: {
  material: Material;
  disciplines: Discipline[];
  page: number | null;
}) {
  const [target, setTarget] = useState<AttachTarget | null>(null);
  const pages = m.file.pageCount ?? 0;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card as="section" aria-labelledby="paginas" className="grid content-start gap-3">
        <h2 id="paginas" className="text-lg font-semibold">
          Páginas
        </h2>
        {m.file.status !== 'ready' ? (
          <p className="text-sm">O arquivo ainda está sendo preparado.</p>
        ) : pages === 0 ? (
          <p className="text-sm">Sem páginas para mostrar (planilha ou imagem).</p>
        ) : (
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: Math.min(pages, 60) }, (_, i) => (
              <li key={i}>
                <Thumb fileId={m.file.id} page={i + 1} focus={page === i + 1} />
              </li>
            ))}
          </ol>
        )}
      </Card>
      <aside className="grid content-start gap-4">
        <Card className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Badge tone={m.origin === 'professor' ? 'accent' : 'neutral'}>
              {ORIGIN_LABEL[m.origin]}
            </Badge>
            <Badge tone="neutral">{TYPE_LABEL[m.type]}</Badge>
          </div>
          <ul className="grid gap-1 text-sm">
            {m.links.map((l) => (
              <li key={l.id}>
                {[l.disciplineName, l.lessonTitle, l.topic, l.teacher].filter(Boolean).join(' · ')}
              </li>
            ))}
          </ul>
          {m.file.downloadable ? (
            <DownloadButton fileId={m.file.id} label="Baixar o original" />
          ) : null}
        </Card>
        <Card as="section" aria-labelledby="versoes" className="grid gap-2">
          <h2 id="versoes" className="text-lg font-semibold">
            Versões
          </h2>
          <ul className="grid gap-1 text-sm">
            {m.versions.map((v) => (
              <li key={v.version}>
                Versão {v.version} · {v.file.name} · {WHEN.format(new Date(v.createdAt))}
                {v.version === m.version ? ' (atual)' : ''}
              </li>
            ))}
          </ul>
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setTarget({ materialId: m.id })}
            >
              Enviar nova versão
            </Button>
          </div>
        </Card>
      </aside>
      <AttachDialog target={target} disciplines={disciplines} onClose={() => setTarget(null)} />
    </div>
  );
}
