import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Fontes no repositório (OFL, ver src/fonts/LICENSE.md): o build não depende de rede e o
// navegador do aluno não faz requisição ao Google.
const display = localFont({
  src: '../fonts/archivo-black-latin-400.woff2',
  weight: '400',
  variable: '--font-archivo',
  display: 'swap',
});
const sans = localFont({
  src: [
    { path: '../fonts/hind-latin-400.woff2', weight: '400' },
    { path: '../fonts/hind-latin-500.woff2', weight: '500' },
    { path: '../fonts/hind-latin-600.woff2', weight: '600' },
    { path: '../fonts/hind-latin-700.woff2', weight: '700' },
  ],
  variable: '--font-hind',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Cognuss', template: '%s · Cognuss' },
  description: 'Plataforma de estudo diário para a graduação em saúde. Um pouco, todo dia.',
  robots: { index: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0d0b0b',
};

// Roda antes da pintura, para não piscar: aplica o tema (escuro por padrão, claro se o aluno
// escolheu no botão do topo) e o visual experimental de vidro (styles/glass.css).
// ?look=glass ou ?look=classic na URL grava a escolha do visual neste navegador.
const bootScript = `(function(){try{var d=document.documentElement;if(localStorage.getItem('gutta-theme')==='light')d.dataset.theme='light';var q=new URLSearchParams(location.search).get('look');if(q==='glass'||q==='classic')localStorage.setItem('gutta-look',q);if((q||localStorage.getItem('gutta-look'))==='glass')d.dataset.look='glass'}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
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
