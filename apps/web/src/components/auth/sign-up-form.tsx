'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { signUpAction, type SignUpState } from '@/features/auth/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';

// Três campos e o aceite (Hick, Parkinson). O resto do perfil vem no onboarding.
export function SignUpForm() {
  const [state, action, pending] = useActionState<SignUpState | null, FormData>(signUpAction, null);

  if (state?.ok) {
    return (
      <Alert tone="success">
        <p className="font-medium">Conta criada. Confira seu e-mail.</p>
        <p className="mt-1">
          Enviamos um link de confirmação para <strong>{state.email}</strong>. Ele vale por 1 hora.
          Depois de confirmar, você já cai no primeiro passo.
        </p>
      </Alert>
    );
  }
  const errors = state && !state.ok ? state.errors : {};
  const values = state && !state.ok ? state.values : undefined;

  return (
    <form action={action} className="grid gap-4" noValidate>
      {errors.form ? <Alert tone="danger">{errors.form}</Alert> : null}
      <Field label="Como quer ser chamado(a)" error={errors.name}>
        {(p) => (
          <Input
            {...p}
            name="name"
            autoComplete="given-name"
            defaultValue={values?.name}
            required
          />
        )}
      </Field>
      <Field
        label="E-mail"
        hint="Seu e-mail pessoal. É por ele que você entra."
        error={errors.email}
      >
        {(p) => (
          <Input
            {...p}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            defaultValue={values?.email}
            required
          />
        )}
      </Field>
      <Field label="Senha" hint="Pelo menos 8 caracteres." error={errors.password}>
        {(p) => (
          <PasswordInput
            {...p}
            name="password"

            autoComplete="new-password"
            minLength={8}
            required
          />
        )}
      </Field>

      <fieldset className="grid gap-3 text-sm">
        <legend className="sr-only">Consentimentos</legend>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="terms"
            className="mt-0.5 size-5 accent-[var(--accent)]"
            aria-describedby={errors.terms ? 'terms-error' : undefined}
            required
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
        {errors.terms ? (
          <p id="terms-error" role="alert" className="font-medium text-danger">
            {errors.terms}
          </p>
        ) : null}
        <label className="flex items-start gap-3 text-muted">
          <input
            type="checkbox"
            name="marketing"
            className="mt-0.5 size-5 accent-[var(--accent)]"
          />
          <span>Quero receber novidades e ofertas do Gutta (opcional, dá para mudar depois).</span>
        </label>
      </fieldset>

      <Button type="submit" size="lg" loading={pending}>
        Criar conta
      </Button>
    </form>
  );
}
