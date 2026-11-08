import Image from 'next/image';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { Wordmark } from '@/components/shared/logo';
import { ThemeToggle } from '@/components/shared/theme-toggle';

const STEPS = [
  {
    title: 'Sonda',
    text: 'Algumas questões mostram onde você está em cada assunto.',
    img: '/img/passo-sonda.jpg',
  },
  {
    title: 'Goteja',
    text: 'Todo dia, poucas questões e revisões, no tempo que você tem.',
    img: '/img/passo-goteja.jpg',
  },
  {
    title: 'Cava',
    text: 'O que você erra volta na hora certa, até ficar.',
    img: '/img/passo-cava.jpg',
  },
];

/*
  Landing no layout do protótipo (ADR 0007): capa com o cérebro e uma fileira de capas dos passos.
  Continua com uma promessa e um único primário, "Criar conta grátis" (Hick, Von Restorff),
  e "Entrar" no canto, onde se espera (Jakob). Nada de número inventado na capa.
*/
export default function Home() {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-bg to-transparent px-4 py-4 sm:px-6 md:px-12">
        <Wordmark className="text-3xl" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/entrar" className={buttonClass('secondary')}>
            Entrar
          </Link>
        </div>
      </header>

      <section className="relative isolate h-[88vh] min-h-[560px] w-full overflow-hidden">
        <Image
          src="/img/hero-brain.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover object-[70%_center] md:object-center"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-bg via-bg/75 to-bg/10" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-bg to-transparent" />
        <main
          id="conteudo"
          className="flex h-full max-w-2xl flex-col justify-center gap-5 px-4 sm:px-6 md:px-12"
        >
          <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
            Seu tutor pelo curso de Medicina · em construção
          </p>
          <h1 className="text-[clamp(44px,9vw,84px)] leading-[0.95]">
            Um pouco,
            <br />
            todo dia.
          </h1>
          <p className="max-w-[52ch] text-base text-fg/85 md:text-lg">
            Você entra e já encontra o próximo passo de estudo: questões comentadas, revisão dos
            seus erros e flashcards no dia certo, de acordo com o seu curso, semestre e as suas
            provas.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <Link href="/cadastro" className={buttonClass('primary', 'lg')}>
              Criar conta grátis
            </Link>
            <span className="text-sm text-fg/80">Leva cerca de 2 minutos.</span>
          </div>
        </main>
      </section>

      <section aria-labelledby="como" className="relative z-10 -mt-20 pb-16">
        <h2 id="como" className="mb-3 px-4 text-xl sm:px-6 md:px-12">
          Como funciona
        </h2>
        <ol
          tabIndex={0}
          aria-labelledby="como"
          className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:px-6 md:px-12"
        >
          {STEPS.map((s, i) => (
            <li key={s.title} className="w-72 shrink-0 snap-start">
              <div className="relative isolate flex aspect-video flex-col justify-end overflow-hidden rounded-[var(--radius)] p-3 shadow-card">
                <Image src={s.img} alt="" fill sizes="288px" className="-z-10 object-cover" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                <span className="text-[11px] font-semibold tracking-widest text-cover-muted uppercase">
                  Passo {i + 1}
                </span>
                <h3 className="text-xl text-cover-fg">{s.title}</h3>
              </div>
              <p className="mt-2 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-line px-4 py-6 text-xs text-muted sm:px-6 md:px-12">
        Cognuss · 2026 · <Link href="/termos">Termos</Link> ·{' '}
        <Link href="/politica-de-privacidade">Privacidade</Link>
      </footer>
    </div>
  );
}
