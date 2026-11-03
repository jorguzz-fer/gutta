import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/shared/legal-page';

export const metadata: Metadata = { title: 'Termos de uso' };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso">
      <h2>O que é o Gutta</h2>
      <p>
        Uma plataforma de estudo para estudantes de graduação em saúde. O conteúdo é educacional. Ao
        criar a conta, você concorda com estes termos e com a{' '}
        <Link href="/politica-de-privacidade">política de privacidade</Link>.
      </p>
      <h2>O que o Gutta não é</h2>
      <ul>
        <li>Não substitui aula, professor nem bibliografia da sua instituição.</li>
        <li>Não é serviço de saúde: não use para orientar atendimento de pacientes reais.</li>
        <li>Não tem vínculo oficial com a sua faculdade, a menos que ela diga o contrário.</li>
      </ul>
      <h2>Conteúdo marcado como demonstração</h2>
      <p>
        Itens com o selo &quot;Demonstração · sem revisão&quot; ainda não passaram pela revisão
        editorial.
      </p>
      <h2>Tutor IA</h2>
      <ul>
        <li>
          O tutor responde com base no material do módulo, mas pode errar. Confira com a
          bibliografia e com o professor.
        </li>
        <li>Ele não orienta casos clínicos reais e recusa esse tipo de pedido.</li>
        <li>Há um limite diário de perguntas por aluno.</li>
      </ul>
      <h2>Sua conta</h2>
      <ul>
        <li>Você é responsável pela sua senha. A conta é pessoal: não compartilhe.</li>
        <li>
          Proibido enviar dados de pacientes, dados pessoais de outras pessoas ou conteúdo que você
          não tem direito de usar.
        </li>
        <li>
          Proibido tentar acessar dados de outros alunos, burlar limites ou atrapalhar o serviço.
          Nesses casos, a conta pode ser suspensa.
        </li>
      </ul>
      <h2>Turmas</h2>
      <p>
        Ao entrar numa turma pelo código, o professor passa a ver seu desempenho a partir dali. Você
        sai quando quiser, em Perfil.
      </p>
      <h2>Encerrar a conta</h2>
      <p>
        Você pede a exclusão em <Link href="/app/privacidade">Privacidade</Link>. O conteúdo
        editorial do Gutta (questões, módulos, aulas) continua sendo do Gutta e dos autores.
      </p>
      <h2>Mudanças</h2>
      <p>
        Quando estes termos mudarem, avisamos no app e pedimos que você leia e confirme de novo.
      </p>
    </LegalPage>
  );
}
