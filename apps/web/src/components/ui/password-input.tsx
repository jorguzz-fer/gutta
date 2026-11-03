'use client';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Input } from './field';

/*
  Campo de senha com o olho para mostrar o que foi digitado. O botão fica dentro do campo,
  tem alvo de 44 px, nome acessível e aria-pressed; não entra na ordem do envio (type=button).
*/
export function PasswordInput({
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...rest}
        type={visible ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={['pr-12', className].filter(Boolean).join(' ')}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visible}
        aria-controls={rest.id}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-[var(--radius)] text-muted hover:text-fg"
      >
        {visible ? (
          <EyeOff className="size-5" aria-hidden />
        ) : (
          <Eye className="size-5" aria-hidden />
        )}
      </button>
    </div>
  );
}
