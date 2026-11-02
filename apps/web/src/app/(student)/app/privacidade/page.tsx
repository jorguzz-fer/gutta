import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, buttonClass } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { deletionAction, marketingAction } from '@/features/privacy/actions';
import { currentConsents } from '@/features/privacy/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Privacidade' };

/*
  Privacidade (SPEC §13.1). Cada finalidade explicada em uma linha; só o que é opcional tem
  botão. Exportar é um clique; excluir pede confirmação digitada, porque não tem volta.
*/
export default async function PrivacyPage() {
  const user = await requireStudent('/app/privacidade');
  const c = await currentConsents(user.id);
  const marketing = c.latest.marketing?.granted ?? false;
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  });

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">Privacidade e seus dados</h1>
        <p className="text-muted">
          Versão da política: {c.policyVersion}.{' '}
          <Link href="/politica-de-privacidade">Ler a política</Link>.
        </p>
      </div>

      <Card as="section" aria-labelledby="finalidades" className="grid gap-4">
        <h2 id="finalidades" className="text-xl font-bold">
          Como usamos seus dados
        </h2>
        <ul className="grid gap-4">
          <li className="flex items-start justify-between gap-4">
            <span>
              <strong>Conta e segurança</strong>
              <br />
              <span className="text-sm text-muted">
                Login, confirmação de e-mail e recuperação de senha.
              </span>
            </span>
            <Badge>essencial</Badge>
          </li>
          <li className="flex items-start justify-between gap-4">
            <span>
              <strong>Personalização do estudo</strong>
              <br />
              <span className="text-sm text-muted">
                Suas respostas e revisões decidem o próximo passo. Sua faculdade não vê seus dados
                individuais.
              </span>
            </span>
            <Badge>essencial</Badge>
          </li>
          <li className="flex items-start justify-between gap-4">
            <span>
              <strong>Novidades e ofertas</strong>
              <br />
              <span className="text-sm text-muted">
                {marketing ? 'Você recebe.' : 'Você não recebe.'} Desligar não muda nada no seu
                estudo.
                {c.latest.marketing ? ` Última mudança: ${fmt.format(c.latest.marketing.at)}.` : ''}
              </span>
            </span>
            <form action={marketingAction}>
              <input type="hidden" name="granted" value={marketing ? 'false' : 'true'} />
              <Button type="submit" variant="secondary">
                {marketing ? 'Desligar' : 'Ligar'}
              </Button>
            </form>
          </li>
        </ul>
      </Card>

      <Card as="section" aria-labelledby="exportar" className="grid gap-3">
        <h2 id="exportar" className="text-xl font-bold">
          Baixar meus dados
        </h2>
        <p className="text-muted">
          Um arquivo JSON com perfil, respostas, revisões, cartões, consentimentos e eventos de uso.
        </p>
        <div>
          <a href="/api/v1/me/export" className={buttonClass('secondary')} download>
            Baixar arquivo
          </a>
        </div>
      </Card>

      <Card as="section" aria-labelledby="excluir" className="grid gap-3 border-danger/40">
        <h2 id="excluir" className="text-xl font-bold">
          Excluir minha conta
        </h2>
        {c.openDeletion ? (
          <>
            <Alert tone="warn">
              Pedido de exclusão registrado em {fmt.format(c.openDeletion.createdAt)}. Seus dados
              serão excluídos ou anonimizados em até 15 dias. Até lá, você pode desistir.
            </Alert>
            <form action={deletionAction}>
              <input type="hidden" name="op" value="cancel" />
              <Button type="submit" variant="secondary">
                Desistir da exclusão
              </Button>
            </form>
          </>
        ) : (
          <form action={deletionAction} className="grid gap-3">
            <p className="text-muted">
              Apaga conta, respostas, revisões e cartões. Baixe seus dados antes, se quiser guardar.
            </p>
            <Field label="Para confirmar, digite EXCLUIR">
              {(p) => <Input {...p} name="confirm" autoComplete="off" pattern="EXCLUIR" required />}
            </Field>
            <div>
              <Button type="submit" variant="danger">
                Pedir exclusão
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
