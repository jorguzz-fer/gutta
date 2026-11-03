import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { requireRole, EDITORIAL_ROLES } from '@/lib/auth/session';

const EDITORIAL = [
  {
    href: '/admin/questoes',
    title: 'Questões',
    text: 'Criar, revisar e publicar questões comentadas.',
    cta: 'Abrir fila editorial',
  },
];
const ADMIN = [
  {
    href: '/admin/cursos',
    title: 'Cursos',
    text: 'Cursos, disciplinas, assuntos e módulos, com o fluxo de publicação.',
    cta: 'Gerenciar catálogo',
  },
  {
    href: '/admin/usuarios',
    title: 'Usuários',
    text: 'Contas, papéis (professor, editor, revisão, admin) e acesso.',
    cta: 'Gerenciar pessoas',
  },
  {
    href: '/admin/instituicoes',
    title: 'Instituições',
    text: 'Aprovar as sugeridas pelos alunos e manter a lista.',
    cta: 'Ver instituições',
  },
  {
    href: '/admin/tutor',
    title: 'Tutor IA',
    text: 'Uso, custo, conversas e o botão de desligar.',
    cta: 'Abrir tutor',
  },
  {
    href: '/admin/privacidade',
    title: 'Privacidade (LGPD)',
    text: 'Pedidos dos titulares com prazo, exclusão de contas e retenção.',
    cta: 'Abrir fila',
  },
  {
    href: '/admin/metricas',
    title: 'Métricas',
    text: 'Estudantes ativos na semana e uso do banco de questões.',
    cta: 'Ver métricas',
  },
];

export default async function AdminHome() {
  const user = await requireRole(EDITORIAL_ROLES);
  const isAdmin = user.roles.includes('admin');
  const cards = [...EDITORIAL, ...(isAdmin ? ADMIN : [])];
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl md:text-4xl">{isAdmin ? 'Administração' : 'Editorial'}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Card key={c.href} className="relative grid content-start gap-1">
            <h2 className="text-lg">{c.title}</h2>
            <p className="text-muted">{c.text}</p>
            <Link href={c.href} className="mt-2 after:absolute after:inset-0">
              {c.cta}
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
