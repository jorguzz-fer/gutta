'use client';
import { useActionState, useRef } from 'react';
import { createCardAction, type CardFormState } from '@/features/flashcards/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/field';

export function NewCardForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<CardFormState, FormData>(async (prev, form) => {
    const res = await createCardAction(prev, form);
    if (res?.ok) formRef.current?.reset();
    return res;
  }, null);
  return (
    <form ref={formRef} action={action} className="grid gap-3">
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}
      <Field
        label="Frente"
        hint="Uma pergunta curta. Ex.: o que piora o sopro da MCH?"
        error={state?.errors?.front}
      >
        {(p) => <Textarea {...p} name="front" rows={2} maxLength={500} required />}
      </Field>
      <Field label="Verso" error={state?.errors?.back}>
        {(p) => <Textarea {...p} name="back" rows={3} maxLength={2000} required />}
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Criar cartão
        </Button>
      </div>
    </form>
  );
}
