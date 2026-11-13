'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { savePersonalAction, type SignupFormState } from '@/features/signup/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';

export function PersonalForm({
  initial,
  needsTerms,
}: {
  initial: { fullName: string; cpfMasked: string | null; phone: string };
  needsTerms: boolean;
}) {
  const [state, action, pending] = useActionState<SignupFormState, FormData>(
    savePersonalAction,
    null,
  );
  const e = state?.errors ?? {};
  const v = state?.values ?? {};
  return (
    <form action={action} className="grid gap-5" noValidate>
      {e.form ? <Alert tone="danger">{e.form}</Alert> : null}
      <Field label="Nome completo" error={e.fullName}>
        {(p) => (
          <Input
            {...p}
            name="fullName"
            autoComplete="name"
            defaultValue={v.fullName ?? initial.fullName}
            required
          />
        )}
      </Field>
      <Field
        label="CPF"
        error={e.cpf}
        hint={
          initial.cpfMasked
            ? `Salvo: ${initial.cpfMasked}. Deixe em branco para manter.`
            : 'Usado só para emitir nota fiscal. Guardamos o número cifrado.'
        }
      >
        {(p) => (
          <Input
            {...p}
            name="cpf"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            defaultValue={v.cpf ?? ''}
            required={!initial.cpfMasked}
          />
        )}
      </Field>
      <Field
        label="Telefone com DDD"
        error={e.phone}
        hint="Para contato. Mensagem por WhatsApp só se você autorizar depois."
      >
        {(p) => (
          <Input
            {...p}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 98765-4321"
            defaultValue={v.phone ?? initial.phone}
            required
          />
        )}
      </Field>
      {needsTerms ? (
        <div className="grid gap-1">
          <label className="flex min-h-11 items-start gap-3 text-[15px]">
            <input
              type="checkbox"
              name="terms"
              className="mt-1 size-5 accent-[var(--accent)]"
              aria-invalid={e.terms ? true : undefined}
            />
            <span>
              Li e aceito os{' '}
              <Link href="/termos" target="_blank">
                termos de uso
              </Link>{' '}
              e a{' '}
              <Link href="/politica-de-privacidade" target="_blank">
                política de privacidade
              </Link>
              .
            </span>
          </label>
          {e.terms ? (
            <p className="text-[13px] font-medium text-danger" role="alert">
              {e.terms}
            </p>
          ) : null}
        </div>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar e continuar'}
        </Button>
      </div>
    </form>
  );
}
