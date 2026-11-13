import type { Metadata } from 'next';
import { AdminHeader } from '@/components/admin/ui';
import { requireRole } from '@/lib/auth/session';
import { PenLab } from './pen-lab';

export const metadata: Metadata = { title: 'Teste da caneta' };

export default async function PenLabPage() {
  await requireRole(['admin'], '/admin/lab/caneta');
  return (
    <div className="grid gap-6">
      <AdminHeader
        title="Teste da caneta"
        lead="Abra esta página no iPad e no tablet Android, escreva por um minuto com a caneta, apoie a mão na tela enquanto escreve e use o dedo para rolar. Depois copie o resultado e cole em docs/experimentos/caneta.md."
      />
      <PenLab />
    </div>
  );
}
