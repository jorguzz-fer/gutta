import { BookOpen, CalendarCheck, Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Wordmark } from '@/components/shared/logo';
import { ThemeToggle } from '@/components/shared/theme-toggle';

const POINTS = [
  {
    icon: Play,
    title: 'Seu próximo passo começa aqui',
    text: 'Módulos com aula interativa e resumo.',
  },
  {
    icon: BookOpen,
    title: 'Conhecimento que fica',
    text: 'Questões comentadas e flashcards para revisar o que importa.',
  },
  {
    icon: CalendarCheck,
    title: 'No seu ritmo',
    text: 'Revisão no dia certo, de acordo com as suas provas.',
  },
];

/*
  Tela de conta no layout do protótipo (ADR 0007): painel da marca à esquerda (só no desktop)
  e o formulário à direita. O painel é decorativo; tudo o que importa está no formulário.
*/
export function AuthShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside
        aria-hidden="true"
        className="relative isolate hidden overflow-hidden bg-login-panel px-12 py-14 text-cover-fg lg:flex lg:flex-col"
      >
        <Image
          src="/img/hero.jpg"
          alt=""
          fill
          sizes="50vw"
          className="-z-10 object-cover opacity-20 mix-blend-luminosity"
        />
        <Wordmark className="text-3xl" tone="cover" dot />
        <div className="mt-auto grid max-w-md gap-6">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] uppercase">
            <span className="size-1.5 rounded-full bg-accent" /> Sua formação em saúde, todos os
            dias
          </p>
          <p className="font-display text-[clamp(30px,3vw,40px)] leading-[1.08]">
            Mais conhecimento.
            <br />
            Mais confiança.
            <br />
            <span className="text-accent">Mais Cognuss.</span>
          </p>
          <span className="h-1 w-12 bg-accent" />
          <ul className="grid gap-3">
            {POINTS.map((p) => (
              <li
                key={p.title}
                className="flex gap-4 rounded-[var(--radius)] border border-login-line bg-login-surface/70 p-4"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius)] bg-login-panel">
                  <p.icon className="size-5 text-accent" />
                </span>
                <span>
                  <span className="block font-semibold">{p.title}</span>
                  <span className="block text-sm text-cover-muted">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-10 text-sm text-cover-muted">Cognuss · um pouco, todo dia.</p>
      </aside>

      <div className="flex min-h-dvh flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-fg no-underline">
            ← Início
          </Link>
          <ThemeToggle />
        </div>
        <main
          id="conteudo"
          className="mx-auto grid w-full max-w-sm flex-1 content-center gap-6 py-10"
        >
          <Link href="/" aria-label="Cognuss, página inicial" className="no-underline">
            <Wordmark className="text-4xl" dot />
          </Link>
          <div className="grid gap-2">
            <h1 className="text-3xl">{title}</h1>
            {lead ? <p className="text-muted">{lead}</p> : null}
          </div>
          {children}
          {footer ? (
            <div className="border-t border-line pt-5 text-center text-sm text-muted">{footer}</div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
