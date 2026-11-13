import type { Metadata } from 'next';
import Link from 'next/link';
import { Flash } from '@/components/admin/ui';
import { Button, buttonClass } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import {
  cancelRequestAction,
  consentAction,
  deletionAction,
  redactTutorAction,
  rightRequestAction,
} from '@/features/privacy/actions';
import {
  currentConsents,
  RESPONSE_DAYS,
  RIGHT_KINDS,
  RIGHT_LABEL,
  type OptionalPurpose,
} from '@/features/privacy/service';
import { currentRetention } from '@/features/privacy/admin';
import { requireStudent } from '@/lib/auth/session';
import { legalInfo } from '@/lib/legal';

export const metadata: Metadata = { title: 'Privacidade' };

const DAY = 24 * 60 * 60 * 1000;

/*
  Privacidade (SPEC §13.1; LGPD arts. 9º, 18 e 19). Cada finalidade com a base legal em
  linguagem simples; só o que depende de consentimento tem botão. Os direitos do titular
  viram pedidos com prazo, e a resposta aparece aqui mesmo.
*/
export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await requireStudent('/app/privacidade');
  const sp = await searchParams;
  const c = await currentConsents(user.id);
  const legal = legalInfo();
  const retention = await currentRetention();
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  });

  const purposes: {
    title: string;
    text: string;
    basis: string;
    toggle?: OptionalPurpose;
  }[] = [
    {
      title: 'Conta e segurança',
      text: 'Login, confirmação de e-mail, recuperação de senha e proteção contra abuso.',
      basis: 'necessário para o serviço',
    },
    {
      title: 'Personalização do estudo',
      text: 'Suas respostas e revisões decidem o próximo passo. Sua faculdade não vê seus dados individuais.',
      basis: 'necessário para o serviço',
    },
    {
      title: 'Turmas',
      text: 'Só quando você entra numa turma pelo código: o professor vê seu desempenho a partir dali. Para parar, saia da turma em Perfil.',
      basis: 'sua escolha',
    },
    {
      title: 'Tutor IA',
      text: 'Pergunta, material do módulo e resumo das suas respostas no módulo vão para a Anthropic (EUA), que roda o modelo. Nome e e-mail não vão.',
      basis: 'sua autorização',
      toggle: 'ai_tutor',
    },
    {
      title: 'Leitura dos seus materiais pela IA',
      text: 'O cronograma (e, depois, os materiais) que você envia vai para a Anthropic (EUA) para a IA extrair datas e temas. Nada entra na sua agenda sem você conferir. Nome, e-mail e CPF não vão.',
      basis: 'sua autorização',
      toggle: 'ai_materials',
    },
    {
      title: 'Novidades e ofertas',
      text: 'Avisos de recursos novos e ofertas. Desligar não muda nada no seu estudo.',
      basis: 'sua autorização',
      toggle: 'marketing',
    },
    {
      title: 'Registros de segurança',
      text: 'Quem mudou o quê e quando (auditoria), sem o conteúdo das suas respostas.',
      basis: 'proteção da plataforma',
    },
  ];

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">Privacidade e seus dados</h1>
        <p className="text-muted">
          Versão da política: {c.policyVersion}.{' '}
          <Link href="/politica-de-privacidade">Ler a política</Link>.
        </p>
      </div>
      <Flash ok={sp.ok} erro={sp.erro} />

      <Card as="section" aria-labelledby="finalidades" className="grid gap-4">
        <h2 id="finalidades" className="text-xl font-bold">
          Como usamos seus dados
        </h2>
        <ul className="grid gap-4">
          {purposes.map((p) => {
            const state = p.toggle ? c.latest[p.toggle] : undefined;
            const on = state?.granted ?? false;
            return (
              <li key={p.title} className="flex items-start justify-between gap-4">
                <span>
                  <strong>{p.title}</strong> <Badge>{p.basis}</Badge>
                  <br />
                  <span className="text-sm text-muted">
                    {p.text}
                    {p.toggle ? (on ? ' Autorizado.' : ' Não autorizado.') : ''}
                    {state ? ` Última mudança: ${fmt.format(state.at)}.` : ''}
                  </span>
                </span>
                {p.toggle ? (
                  <form action={consentAction}>
                    <input type="hidden" name="purpose" value={p.toggle} />
                    <input type="hidden" name="granted" value={on ? 'false' : 'true'} />
                    <Button
                      type="submit"
                      variant="secondary"
                      aria-label={`${on ? 'Desligar' : 'Ligar'}: ${p.title}`}
                    >
                      {on ? 'Desligar' : 'Ligar'}
                    </Button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
        {c.tutorMessages > 0 ? (
          <form
            action={redactTutorAction}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"
          >
            <span className="text-sm text-muted">
              {c.tutorMessages} mensagens suas e do tutor guardadas. Apagar remove o texto para
              sempre (fica só a contagem de uso).
            </span>
            <Button type="submit" variant="ghost">
              Apagar conversas com o tutor
            </Button>
          </form>
        ) : null}
      </Card>

      <Card as="section" aria-labelledby="exportar" className="grid gap-3">
        <h2 id="exportar" className="text-xl font-bold">
          Baixar meus dados
        </h2>
        <p className="text-muted">
          Um arquivo JSON com conta, perfil, respostas, revisões, cartões, conversas com o tutor,
          turmas, consentimentos, pedidos e eventos de uso. Serve para conferir e para levar a outro
          serviço.
        </p>
        <div>
          <a href="/api/v1/me/export" className={buttonClass('secondary')} download>
            Baixar arquivo
          </a>
        </div>
      </Card>

      <Card as="section" aria-labelledby="pedidos" className="grid gap-4">
        <h2 id="pedidos" className="text-xl font-bold">
          Corrigir dados ou fazer outro pedido
        </h2>
        <p className="text-muted">
          Nome, curso, semestre e disciplinas você corrige direto em{' '}
          <Link href="/app/perfil">Perfil</Link>. Para o resto, faça um pedido: respondemos em até{' '}
          {RESPONSE_DAYS} dias, aqui mesmo.
        </p>
        <form action={rightRequestAction} className="grid gap-3">
          <Field label="Tipo de pedido">
            {(p) => (
              <Select {...p} name="kind" required defaultValue="">
                <option value="" disabled>
                  Escolha
                </option>
                {RIGHT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {RIGHT_LABEL[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="O que você precisa" hint="Não escreva senhas nem dados de pacientes.">
            {(p) => (
              <Textarea {...p} name="details" required minLength={10} maxLength={2000} rows={3} />
            )}
          </Field>
          <div>
            <Button type="submit" variant="secondary">
              Enviar pedido
            </Button>
          </div>
        </form>
        {c.requests.length ? (
          <ul className="grid gap-3 border-t border-line pt-4" aria-label="Seus pedidos">
            {c.requests.map((r) => (
              <li key={r.id} className="grid gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <strong>{RIGHT_LABEL[r.kind]}</strong>
                  <Badge tone={r.status === 'open' ? 'warn' : 'neutral'}>
                    {r.status === 'open'
                      ? `resposta até ${fmt.format(new Date(r.createdAt.getTime() + RESPONSE_DAYS * DAY))}`
                      : r.status === 'done'
                        ? 'respondido'
                        : 'cancelado'}
                  </Badge>
                </span>
                <span className="text-sm text-muted">
                  {fmt.format(r.createdAt)}: {r.details}
                </span>
                {r.response ? (
                  <Alert tone="success">
                    <span className="whitespace-pre-wrap">{r.response}</span>
                  </Alert>
                ) : null}
                {r.status === 'open' ? (
                  <form action={cancelRequestAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button type="submit" variant="ghost">
                      Cancelar pedido
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card as="section" aria-labelledby="encarregado" className="grid gap-2">
        <h2 id="encarregado" className="text-xl font-bold">
          Encarregado de dados
        </h2>
        {legal.dpoName && legal.dpoEmail ? (
          <p className="text-muted">
            {legal.dpoName} · <a href={`mailto:${legal.dpoEmail}`}>{legal.dpoEmail}</a>. Se a
            resposta não resolver, você pode reclamar à ANPD (gov.br/anpd).
          </p>
        ) : (
          <Alert tone="warn">
            Contato do encarregado ainda a definir. Enquanto isso, use os pedidos acima.
          </Alert>
        )}
      </Card>

      <Card as="section" aria-labelledby="excluir" className="grid gap-3 border-danger/40">
        <h2 id="excluir" className="text-xl font-bold">
          Excluir minha conta
        </h2>
        {c.openDeletion ? (
          <>
            <Alert tone="warn">
              Pedido de exclusão registrado em {fmt.format(c.openDeletion.createdAt)}. A conta e os
              dados serão apagados até{' '}
              {fmt.format(
                new Date(c.openDeletion.createdAt.getTime() + retention.deletionGraceDays * DAY),
              )}
              . Até lá, você pode desistir.
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
              Apaga conta, perfil, respostas, revisões, cartões, conversas com o tutor e turmas.
              Fica só o registro de que a exclusão aconteceu, sem nome nem e-mail. Baixe seus dados
              antes, se quiser guardar.
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
