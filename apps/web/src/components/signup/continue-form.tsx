'use client';
import { useActionState } from 'react';
import {
  continueFromDisciplinesAction,
  continueFromRoutineAction,
  type SignupFormState,
} from '@/features/signup/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';

const ACTIONS = {
  disciplinas: continueFromDisciplinesAction,
  rotina: continueFromRoutineAction,
};

export function ContinueForm({
  step = 'disciplinas',
  label = 'Continuar',
}: {
  step?: keyof typeof ACTIONS;
  label?: string;
}) {
  const [state, action, pending] = useActionState<SignupFormState, FormData>(ACTIONS[step], null);
  return (
    <form action={action} className="grid gap-3">
      {state?.errors.form ? <Alert tone="danger">{state.errors.form}</Alert> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : label}
        </Button>
      </div>
    </form>
  );
}
