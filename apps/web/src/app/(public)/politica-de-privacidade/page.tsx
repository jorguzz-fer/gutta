import type { Metadata } from 'next';
import { connection } from 'next/server';
import Link from 'next/link';
import { LegalPage } from '@/components/shared/legal-page';
import { currentRetention } from '@/features/privacy/admin';
import { RESPONSE_DAYS } from '@/features/privacy/service';
import { legalInfo } from '@/lib/legal';
import { featureEnabled } from '@/features/flags/service';

export const metadata: Metadata = { title: 'Política de privacidade' };

const TBD = 'a definir antes do piloto';

/*
  Política de privacidade (LGPD art. 9º). Linguagem simples, uma tabela por assunto. Dados do
  controlador e do encarregado vêm do ambiente; os prazos de retenção vêm do banco, os mesmos
  que a limpeza aplica. Nada aqui é inventado: o que falta aparece como "a definir".
*/
export default async function PrivacyPolicyPage() {
  await connection();
  const legal = legalInfo();
  const r = await currentRetention();
  // O cadastro da v2 coleta CPF e telefone (SPEC v2, D04); a política só fala deles quando
  // ele está ligado, para descrever o que de fato é coletado.
  const signupV2 = await featureEnabled('cadastro');
  // Leitura do cronograma pela IA (SPEC v2, DIS-05): só aparece com o módulo ligado.
  const aiMaterials = signupV2 || (await featureEnabled('disciplinas'));
  const lessonHosts = (process.env.LESSON_ORIGINS ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((o) => o.replace(/^https?:\/\//, ''));

  return (
    <LegalPage title="Política de privacidade">
      <h2>Quem cuida dos seus dados</h2>
      <p>
        Controlador: {legal.controllerName ?? TBD}
        {legal.controllerDocument ? ` (${legal.controllerDocument})` : ''}. Encarregado de dados
        (DPO): {legal.dpoName ?? TBD}
        {legal.dpoEmail ? (
          <>
            , <a href={`mailto:${legal.dpoEmail}`}>{legal.dpoEmail}</a>
          </>
        ) : null}
        . Você também fala com a gente em <Link href="/app/privacidade">Privacidade</Link>, dentro
        do app.
      </p>

      <h2>O que coletamos</h2>
      <ul>
        <li>Conta: nome, e-mail e senha (guardamos só uma versão cifrada, nunca a senha).</li>
        {signupV2 ? (
          <li>
            Dados pessoais: nome completo, CPF e telefone. O CPF fica guardado cifrado e só é usado
            para emitir nota fiscal; o telefone serve para falar com você sobre a sua conta.
          </li>
        ) : null}
        <li>
          Perfil acadêmico: curso, instituição, semestre, disciplinas e datas de prova que você
          informar.
        </li>
        <li>Estudo: respostas, revisões, cartões e tempo de uso.</li>
        <li>Tutor IA, se você usar: suas perguntas e as respostas do tutor.</li>
        {aiMaterials ? (
          <li>
            Arquivos que você envia, como o cronograma da disciplina, e o que a IA leu deles para
            você conferir.
          </li>
        ) : null}
        <li>Turmas, se você entrar em uma: em qual turma está e desde quando.</li>
        <li>
          Dados técnicos: endereço IP e navegador de cada sessão, e registros de quem mudou o quê
          (auditoria).
        </li>
      </ul>
      <p>
        Não coletamos dados de saúde seus. Não envie dados de pacientes: o uso é educacional e isso
        é proibido pelos <Link href="/termos">termos</Link>.
      </p>

      <h2>Para que usamos e com qual base legal</h2>
      <table>
        <thead>
          <tr>
            <th>Finalidade</th>
            <th>Base legal (LGPD art. 7º)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Conta, login, segurança e comunicação essencial (confirmação, senha)</td>
            <td>Execução do contrato com você (V)</td>
          </tr>
          {signupV2 ? (
            <>
              <tr>
                <td>Emitir nota fiscal (CPF)</td>
                <td>
                  Cumprimento de obrigação legal ou regulatória (II), a confirmar na revisão
                  jurídica
                </td>
              </tr>
              <tr>
                <td>Falar com você sobre a sua conta (telefone)</td>
                <td>Execução do contrato com você (V)</td>
              </tr>
            </>
          ) : null}
          <tr>
            <td>Personalizar o estudo: próximo passo, revisões, domínio dos assuntos</td>
            <td>Execução do contrato com você (V)</td>
          </tr>
          <tr>
            <td>Mostrar seu desempenho ao professor de uma turma em que você entrou</td>
            <td>Consentimento (I), dado ao entrar pelo código; termina quando você sai</td>
          </tr>
          <tr>
            <td>Tutor IA</td>
            <td>Consentimento específico (I e art. 33, VIII), pedido antes da primeira pergunta</td>
          </tr>
          {aiMaterials ? (
            <tr>
              <td>Leitura dos seus materiais pela IA (datas e temas do cronograma)</td>
              <td>
                Consentimento específico (I e art. 33, VIII), pedido antes da primeira leitura
              </td>
            </tr>
          ) : null}
          <tr>
            <td>Novidades e ofertas</td>
            <td>Consentimento (I), opcional</td>
          </tr>
          <tr>
            <td>Prevenção de fraude e abuso, auditoria e métricas agregadas do produto</td>
            <td>Legítimo interesse (IX) e exercício regular de direitos (VI)</td>
          </tr>
        </tbody>
      </table>
      <p>
        Recusar ou retirar um consentimento não bloqueia o serviço essencial: você continua
        estudando normalmente.
      </p>

      <h2>Com quem compartilhamos</h2>
      <ul>
        <li>
          Provedor de infraestrutura, onde o app e o banco de dados rodam (operador, sob contrato).
        </li>
        <li>
          Anthropic, nos Estados Unidos, só quando você usa o tutor: recebe a pergunta, o material
          do módulo e o resumo das suas respostas naquele módulo. Nome e e-mail não vão.
        </li>
        {aiMaterials ? (
          <li>
            Anthropic, nos Estados Unidos, quando você autoriza a leitura dos seus materiais: recebe
            o conteúdo do arquivo (o cronograma, por exemplo). Nome, e-mail e CPF não vão.
          </li>
        ) : null}
        <li>
          Provedor de e-mail transacional (Resend, nos Estados Unidos), quando ativo: recebe seu
          e-mail para enviar confirmação e recuperação de senha.
        </li>
        {lessonHosts.length ? (
          <li>
            Site das aulas interativas ({lessonHosts.join(', ')}): a aula abre dentro do app e o seu
            navegador se conecta a esse site, que recebe dados técnicos como IP e navegador.
          </li>
        ) : null}
        <li>
          Sua faculdade não vê seus dados individuais. Indicadores para instituições, se um dia
          existirem, serão só agregados, com grupos mínimos e base legal própria.
        </li>
        <li>Não vendemos seus dados e não usamos para publicidade de terceiros.</li>
      </ul>

      <h2>Transferência internacional</h2>
      <p>
        Tutor IA e e-mail usam empresas nos Estados Unidos. No tutor, a transferência acontece só
        com o seu consentimento específico, que você retira em Privacidade. Os demais casos seguem
        as garantias do art. 33 da LGPD, a confirmar na revisão jurídica.
      </p>

      <h2>Por quanto tempo guardamos</h2>
      <table>
        <thead>
          <tr>
            <th>Dado</th>
            <th>Prazo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Conta, perfil e histórico de estudo</td>
            <td>Enquanto a conta existir. Apagados quando você pede a exclusão.</td>
          </tr>
          <tr>
            <td>Texto das conversas com o tutor</td>
            <td>{r.tutorDays} dias, ou antes se você apagar. Depois fica só a contagem de uso.</td>
          </tr>
          <tr>
            <td>Eventos de uso do produto</td>
            <td>{r.eventsDays} dias</td>
          </tr>
          <tr>
            <td>Registros de auditoria</td>
            <td>{r.auditDays} dias</td>
          </tr>
          <tr>
            <td>Sessões e códigos de verificação</td>
            <td>Até vencerem</td>
          </tr>
        </tbody>
      </table>

      <h2>Seus direitos</h2>
      <p>Pela LGPD (art. 18), você pode, a qualquer momento:</p>
      <ul>
        <li>confirmar que tratamos seus dados e acessá-los (baixar em JSON, em Privacidade);</li>
        <li>corrigir dados (em Perfil, ou por pedido em Privacidade);</li>
        <li>levar seus dados a outro serviço (portabilidade, no mesmo arquivo JSON);</li>
        <li>saber com quem compartilhamos;</li>
        <li>retirar consentimentos e se opor a um uso;</li>
        <li>
          pedir a exclusão da conta. Você tem até {r.deletionGraceDays} dias para desistir; depois a
          exclusão é feita sem outro aviso.
        </li>
      </ul>
      <p>
        Respondemos em até {RESPONSE_DAYS} dias. Se não resolver, você pode reclamar à Autoridade
        Nacional de Proteção de Dados (ANPD).
      </p>

      <h2>Cookies e armazenamento no navegador</h2>
      <p>
        Usamos só o necessário: um cookie de sessão para manter você conectado e o registro da sua
        preferência de tema (claro ou escuro). Não usamos cookies de publicidade nem de análise de
        terceiros.
      </p>

      <h2>Segurança</h2>
      <p>
        Conexão cifrada, senha guardada só como hash, isolamento dos dados de cada aluno no banco e
        verificação em duas etapas obrigatória para a equipe de administração. Se houver um
        incidente com risco para você, avisamos você e a ANPD (art. 48).
      </p>

      <h2>Idade</h2>
      <p>
        O Cognuss é para estudantes de graduação. Se você tem menos de 18 anos, use com o
        conhecimento do seu responsável.
      </p>

      <h2>Mudanças nesta política</h2>
      <p>
        Cada versão tem uma data. Quando ela muda, avisamos no app e pedimos que você leia e
        confirme de novo.
      </p>
    </LegalPage>
  );
}
