import { connection } from 'next/server';
import { Wordmark } from '@/components/shared/logo';
import { requireFeature } from '@/features/flags/service';

// Cadastro da v2 (SPEC v2, 5.1), atrás da chave "cadastro".
export default async function SignupLayout({ children }: { children: React.ReactNode }) {
  // Sempre por requisição: a chave vem do banco, que não existe no build da imagem.
  await connection();
  await requireFeature('cadastro');
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Wordmark />
      {/* Formulários na largura de leitura; a grade da rotina (data-wide) usa a tela toda. */}
      <main
        id="conteudo"
        className="mt-8 grid gap-6 [&>*:not([data-wide])]:mx-auto [&>*:not([data-wide])]:w-full [&>*:not([data-wide])]:max-w-2xl"
      >
        {children}
      </main>
    </div>
  );
}
