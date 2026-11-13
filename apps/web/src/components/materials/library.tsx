'use client';
import { Plus, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { materials } from '@gutta/contracts';
import { Badge, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client-api';
import { AttachDialog, ORIGIN_LABEL, TYPE_LABEL, type AttachTarget } from './attach-dialog';

type Material = materials.MaterialDto;
type Discipline = { id: string; name: string; teachers: string[]; topics: string[] };

/*
  Biblioteca (SPEC v2, MAT-01, 14, 19, 21): lista da aba escolhida, com procedência sempre à
  vista, favorito, lixeira e restaurar.
*/
export function Library({
  items,
  tab,
  disciplines,
}: {
  items: Material[];
  tab: string;
  disciplines: Discipline[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState<AttachTarget | null>(null);
  const act = async (path: string, init: { method: string; body?: unknown }) => {
    await api(path, init);
    router.refresh();
  };
  return (
    <div className="grid gap-4">
      {tab !== 'lixeira' ? (
        <div>
          <Button type="button" onClick={() => setTarget({})} disabled={!disciplines.length}>
            <Plus className="size-4" aria-hidden /> Anexar material
          </Button>
          {!disciplines.length ? (
            <p className="mt-2 text-sm text-muted">
              Cadastre uma disciplina para anexar materiais.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">Itens na lixeira são apagados depois de 30 dias.</p>
      )}
      {items.length === 0 ? (
        <p className="text-muted">Nada por aqui.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((m) => {
            const link = m.links[0];
            return (
              <li key={m.id}>
                <Card className="grid h-full gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">
                      <Link href={`/app/materiais/${m.id}`}>{m.title}</Link>
                    </h3>
                    {tab !== 'lixeira' ? (
                      <button
                        type="button"
                        aria-pressed={m.favorite}
                        aria-label={
                          m.favorite ? `Tirar ${m.title} dos favoritos` : `Favoritar ${m.title}`
                        }
                        className="grid size-11 place-items-center rounded-[var(--radius)] hover:bg-surface-2"
                        onClick={() =>
                          act(`/materials/${m.id}`, {
                            method: 'PATCH',
                            body: { favorite: !m.favorite },
                          })
                        }
                      >
                        <Star
                          className={m.favorite ? 'size-5 fill-current text-accent' : 'size-5'}
                          aria-hidden
                        />
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={m.origin === 'professor' ? 'accent' : 'neutral'}>
                      {ORIGIN_LABEL[m.origin]}
                    </Badge>
                    <Badge tone="neutral">{TYPE_LABEL[m.type]}</Badge>
                    {m.version > 1 ? <Badge tone="neutral">Versão {m.version}</Badge> : null}
                  </div>
                  <p className="text-sm text-muted">
                    {[link?.disciplineName, link?.lessonTitle, link?.topic, link?.teacher]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div>
                    {tab === 'lixeira' ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => act(`/materials/${m.id}/restore`, { method: 'POST' })}
                      >
                        Restaurar
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => act(`/materials/${m.id}`, { method: 'DELETE' })}
                      >
                        Mandar para a lixeira
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <AttachDialog target={target} disciplines={disciplines} onClose={() => setTarget(null)} />
    </div>
  );
}
