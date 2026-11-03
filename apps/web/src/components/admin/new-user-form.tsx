'use client';
import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';
import { Checkbox } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { createUserAction, type NewUserState } from '@/features/admin/actions';

/*
  Novo usuário. A senha temporária aparece uma vez, aqui; quem cria entrega para a pessoa por
  um canal seguro. Sem e-mail transacional ainda, é o caminho para cadastrar professor e equipe.
*/
export function NewUserForm({ roles }: { roles: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<NewUserState, FormData>(createUserAction, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state && 'created' in state) form.current?.reset();
  }, [state]);
  return (
    <div className="grid gap-4">
      {state && 'created' in state ? (
        <Alert tone="success">
          <span className="grid gap-2">
            <span>
              Conta criada para <strong>{state.created.email}</strong>. Senha temporária (aparece só
              agora):
            </span>
            <code className="w-fit rounded bg-surface-2 px-3 py-1.5 font-mono text-lg tracking-wider select-all">
              {state.created.password}
            </code>
            <span className="text-sm">
              Entregue por um canal seguro e peça para trocar em Segurança → Trocar senha no
              primeiro acesso. <Link href={`/admin/usuarios/${state.created.id}`}>Abrir conta</Link>
            </span>
          </span>
        </Alert>
      ) : null}
      {state && 'error' in state ? <Alert tone="danger">{state.error}</Alert> : null}
      <form ref={form} action={action} className="grid gap-4 md:grid-cols-2">
        <Field label="Nome">
          {(p) => <Input {...p} name="name" autoComplete="off" required minLength={2} />}
        </Field>
        <Field label="E-mail">
          {(p) => <Input {...p} name="email" type="email" autoComplete="off" required />}
        </Field>
        <Field label="Papel" hint="Sem papel, a conta é de aluno.">
          {(p) => (
            <Select {...p} name="role" defaultValue="">
              <option value="">Aluno</option>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid content-end">
          <Checkbox
            name="verified"
            label="E-mail já confirmado (conheço a pessoa)"
            defaultChecked
          />
        </div>
        <div className="md:col-span-2">
          <Button type="submit" loading={pending}>
            Criar conta
          </Button>
        </div>
      </form>
    </div>
  );
}
