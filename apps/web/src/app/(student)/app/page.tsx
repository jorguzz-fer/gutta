import { requireUser } from '@/lib/auth/session';

// Dashboard completo entra no item 17 do plano.
export default async function TodayPage() {
  const user = await requireUser();
  return (
    <div className="grid gap-2">
      <h1 className="text-3xl font-bold">Oi, {user.name.split(' ')[0]}</h1>
      <p className="text-muted">Seu painel de estudo aparece aqui.</p>
    </div>
  );
}
