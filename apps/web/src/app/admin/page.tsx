import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { requireRole, EDITORIAL_ROLES } from '@/lib/auth/session';

export default async function AdminHome() {
  const user = await requireRole(EDITORIAL_ROLES);
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold">Editorial</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">Questões</h2>
          <p className="mt-1 text-muted">Criar, revisar e publicar questões comentadas.</p>
          <Link href="/admin/questoes" className="mt-3 inline-block">
            Abrir fila editorial
          </Link>
        </Card>
        {user.roles.includes('admin') ? (
          <Card>
            <h2 className="text-lg font-bold">Métricas</h2>
            <p className="mt-1 text-muted">
              Estudantes ativos na semana e uso do banco de questões.
            </p>
            <Link href="/admin/metricas" className="mt-3 inline-block">
              Ver métricas
            </Link>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
