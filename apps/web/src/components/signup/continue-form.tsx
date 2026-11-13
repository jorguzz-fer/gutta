'use client';
import { useActionState } from 'react';
import { continueFromDisciplinesAction, type SignupFormState } from '@/features/signup/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';

export function ContinueForm() {
  const [state, action, pending] = useActionState<SignupFormState, FormData>(
    continueFromDisciplinesAction,
    null,
  );
  return (
    <form action={action} className="grid gap-3">
      {state?.errors.form ? <Alert tone="danger">{state.errors.form}</Alert> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Continuar'}
        </Button>
      </div>
    </form>
  );
}
