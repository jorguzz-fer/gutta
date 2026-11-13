import { Wordmark } from '@/components/shared/logo';
import { requireFeature } from '@/features/flags/service';

// Cadastro da v2 (SPEC v2, 5.1), atrás da chave "cadastro".
export default async function SignupLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('cadastro');
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Wordmark />
      <main id="conteudo" className="mt-8 grid gap-6">
        {children}
      </main>
    </div>
  );
}
