import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Fontes no repositório (OFL, ver src/fonts/LICENSE.md): o build não depende de rede e o
// navegador do aluno não faz requisição ao Google.
const display = localFont({
  src: '../fonts/bricolage-grotesque-latin.woff2',
  weight: '500 700',
  variable: '--font-bricolage',
  display: 'swap',
});
const sans = localFont({
  src: '../fonts/ibm-plex-sans-latin.woff2',
  weight: '400 600',
  variable: '--font-plex',
  display: 'swap',
});
const mono = localFont({
  src: [
    { path: '../fonts/ibm-plex-mono-400-latin.woff2', weight: '400' },
    { path: '../fonts/ibm-plex-mono-500-latin.woff2', weight: '500' },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Gutta Project', template: '%s · Gutta' },
  description: 'Plataforma de estudo diário para a graduação em saúde. Um pouco, todo dia.',
  robots: { index: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F5F4' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1514' },
  ],
};

// Visual experimental (ver styles/glass.css). Roda antes da pintura para não piscar o
// visual clássico. ?look=glass ou ?look=classic na URL grava a escolha neste navegador.
const lookScript = `(function(){try{var q=new URLSearchParams(location.search).get('look');if(q==='glass'||q==='classic')localStorage.setItem('gutta-look',q);if((q||localStorage.getItem('gutta-look'))==='glass')document.documentElement.dataset.look='glass'}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: lookScript }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
        >
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
