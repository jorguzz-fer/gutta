import type { Metadata } from 'next';
import { LegalPage } from '@/components/shared/legal-page';

export const metadata: Metadata = { title: 'Termos de uso' };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso">
      <h2>O que é o Gutta</h2>
      <p>
        Uma plataforma de estudo para estudantes de graduação em saúde. O conteúdo é educacional.
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
      <h2>Sua conta</h2>
      <p>Você é responsável pela sua senha. Não compartilhe dados de pacientes na plataforma.</p>
    </LegalPage>
  );
}
