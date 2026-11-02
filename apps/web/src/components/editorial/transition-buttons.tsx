'use client';
import { useActionState, useState } from 'react';
import {
  newVersionAction,
  transitionAction,
  type EditorialState,
} from '@/features/editorial/actions';
import type { Status } from '@/features/editorial/service';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/field';

type Props = { id: string; status: Status; isAuthor: boolean; isReviewer: boolean };

// Só aparecem as ações que esta pessoa pode fazer neste status (toda ação tem efeito).
export function TransitionButtons({ id, status, isAuthor, isReviewer }: Props) {
  const [state, action, pending] = useActionState<EditorialState, FormData>(transitionAction, null);
  const [vState, vAction, vPending] = useActionState<EditorialState, FormData>(
    newVersionAction,
    null,
  );
  const [returning, setReturning] = useState(false);
  const btn = (
    to: Status,
    label: string,
    variant: 'primary' | 'secondary' | 'danger' = 'primary',
  ) => (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <Button type="submit" variant={variant} loading={pending}>
        {label}
      </Button>
    </form>
  );
  return (
    <div className="grid gap-3">
      {state?.errors?.length ? <Alert tone="danger">{state.errors.join(' ')}</Alert> : null}
      {vState?.errors?.length ? <Alert tone="danger">{vState.errors.join(' ')}</Alert> : null}
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {status === 'draft' ? btn('in_review', 'Enviar para revisão') : null}
        {status === 'in_review' && isReviewer && !isAuthor ? btn('approved', 'Aprovar') : null}
        {status === 'in_review' && isReviewer ? (
          <Button variant="secondary" onClick={() => setReturning((r) => !r)}>
            Devolver com observações
          </Button>
        ) : null}
        {status === 'approved' && isReviewer ? btn('published', 'Publicar') : null}
        {status === 'published' && isReviewer ? btn('archived', 'Arquivar', 'danger') : null}
        {status === 'archived' && isReviewer ? btn('published', 'Republicar', 'secondary') : null}
        {['approved', 'published', 'archived'].includes(status) ? (
          <form action={vAction}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="secondary" loading={vPending}>
              Editar como nova versão
            </Button>
          </form>
        ) : null}
      </div>
      {status === 'in_review' && isReviewer && isAuthor ? (
        <p className="text-sm text-muted">
          Você é autor desta questão: outra pessoa da revisão precisa aprovar.
        </p>
      ) : null}
      {status === 'in_review' && !isReviewer ? (
        <p className="text-sm text-muted">Aguardando revisão.</p>
      ) : null}
      {returning ? (
        <form action={action} className="grid gap-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="to" value="draft" />
          <Field label="O que precisa mudar">
            {(p) => <Textarea {...p} name="notes" rows={3} required />}
          </Field>
          <div>
            <Button type="submit" variant="secondary" loading={pending}>
              Devolver para rascunho
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
