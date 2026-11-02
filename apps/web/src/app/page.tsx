import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { Wordmark } from '@/components/shared/logo';

// Landing: uma promessa, um CTA primário (Hick, Von Restorff) e "Entrar" onde se espera (Jakob).
export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Wordmark />
        <Link href="/entrar" className={buttonClass('ghost')}>
          Entrar
        </Link>
      </header>

      <main id="conteudo" className="grid flex-1 content-center gap-10 py-10">
        <div className="grid max-w-2xl gap-5">
          <p className="font-mono text-xs tracking-widest text-muted uppercase">
            Graduação em saúde · em construção
          </p>
          <h1 className="text-[clamp(36px,7vw,60px)] font-bold tracking-tight">
            Um pouco, todo dia.
          </h1>
          <p className="max-w-[52ch] text-lg text-muted">
            Você entra e já encontra o próximo passo de estudo: questões comentadas, revisão dos
            seus erros e flashcards no dia certo, de acordo com o seu curso, semestre e as suas
            provas.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/cadastro" className={buttonClass('primary', 'lg')}>
              Criar conta grátis
            </Link>
            <span className="text-sm text-muted">Leva cerca de 2 minutos.</span>
          </div>
        </div>

        <ol className="grid gap-4 sm:grid-cols-3">
          {[
            ['Sonda', 'Algumas questões mostram onde você está em cada assunto.'],
            ['Goteja', 'Todo dia, poucas questões e revisões, no tempo que você tem.'],
            ['Cava', 'O que você erra volta na hora certa, até ficar.'],
          ].map(([title, text], i) => (
            <li
              key={title}
              className="rounded-[var(--radius-lg)] border border-line bg-surface p-5"
            >
              <span className="font-mono text-xs text-muted">0{i + 1}</span>
              <h2 className="mt-1 text-lg font-bold">{title}</h2>
              <p className="mt-1 text-[15px] text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </main>

      <footer className="py-6 font-mono text-xs text-muted">
        Gutta Project · <em className="not-italic">gutta cavat lapidem</em> · 2026
      </footer>
    </div>
  );
}
