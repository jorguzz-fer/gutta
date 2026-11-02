import type { Metadata } from 'next';
import { LegalPage } from '@/components/shared/legal-page';

export const metadata: Metadata = { title: 'Política de privacidade' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade">
      <h2>O que coletamos</h2>
      <ul>
        <li>Conta: nome, e-mail e senha (guardamos só uma versão cifrada, nunca a senha).</li>
        <li>
          Perfil acadêmico: curso, instituição, semestre, disciplinas e datas de prova que você
          informar.
        </li>
        <li>Estudo: respostas, revisões e tempo de uso, para personalizar o que você estuda.</li>
      </ul>
      <h2>Para que usamos</h2>
      <ul>
        <li>Autenticação e segurança da conta.</li>
        <li>Personalização pedagógica: recomendar o próximo passo de estudo.</li>
        <li>Comunicação essencial (confirmação de e-mail, recuperação de senha).</li>
        <li>
          Marketing, só se você autorizar. Dá para desligar a qualquer momento sem perder nada.
        </li>
      </ul>
      <h2>O que não fazemos</h2>
      <ul>
        <li>Não mostramos seus dados individuais à sua faculdade.</li>
        <li>Não vendemos seus dados.</li>
      </ul>
      <h2>Seus direitos</h2>
      <p>Em Privacidade, dentro do app, você exporta seus dados e pede a exclusão da conta.</p>
    </LegalPage>
  );
}
