import { expect, test } from '@playwright/test';
import { completeOnboarding, signUp, uniqueEmail } from './helpers';

// J01 + J02 da SPEC: cadastro → verificação → onboarding → 5 questões → feedback → flashcard → painel.
test('jornada do aluno do cadastro à próxima ação @celular', async ({ page }) => {
  const email = uniqueEmail('aluno');
  await signUp(page, 'Marina Teste', email);
  await completeOnboarding(page);

  // Cold start: painel útil sem histórico.
  await expect(page.getByText('Tudo pronto.')).toBeVisible();
  await expect(page.locator('#proximo')).toContainText('Diagnóstico rápido');
  await expect(page.getByText(/Algumas questões mostram por onde começar/)).toBeVisible();

  // Gabarito nunca vem antes da resposta.
  const leaks: string[] = [];
  page.on('response', async (r) => {
    if (r.url().includes('/next') && /isCorrect|explanation/.test(await r.text().catch(() => '')))
      leaks.push(r.url());
  });

  await page.goto('/app/questoes/nova');
  await page.waitForURL(/\/app\/questoes\/sessao\//);
  let createdCard = false;
  for (let i = 1; i <= 5; i++) {
    await expect(page.getByText(`Questão ${i} de 5`)).toBeVisible();
    await page.locator('label:has(input[name=option])').last().click();
    await page.getByRole('button', { name: 'Responder' }).click();
    await expect(page.getByText(/Você acertou\.|Não foi dessa vez\./)).toBeVisible();
    await expect(page.getByText(/Sem referência cadastrada|Referência:/)).toBeVisible();
    const card = page.getByRole('button', { name: 'Criar flashcard deste erro' });
    if (!createdCard && (await card.count())) {
      await card.click();
      await expect(page.getByText(/Flashcard criado/)).toBeVisible();
      createdCard = true;
    }
    await page.getByRole('button', { name: i === 5 ? 'Ver resultado' : 'Próxima questão' }).click();
  }
  await expect(page.getByText('Sessão concluída')).toBeVisible();
  expect(leaks).toEqual([]);

  await page.getByRole('link', { name: 'Ver o próximo passo' }).click();
  await page.waitForURL((u) => u.pathname === '/app');
  // A recomendação seguinte considera as tentativas: não é mais o diagnóstico de quem não fez nada.
  await expect(page.locator('#proximo')).not.toContainText('Diagnóstico rápido');
  await expect(page.getByText(/questões · \d+ revisões/)).toContainText('5 questões');

  // Revisões: os cartões editoriais novos entram hoje; o do erro, amanhã.
  await page.goto('/app/revisoes');
  await page.getByRole('button', { name: 'Mostrar resposta' }).click();
  await page.getByRole('button', { name: /^Bom/ }).click();
  await expect(page.getByText(/1 de \d+ revisados/)).toBeVisible();
  if (createdCard) {
    await page.goto('/app/flashcards');
    await expect(page.getByText('de uma questão')).toBeVisible();
  }
});

test('perfil: troca de disciplina mantém histórico e reflete nas recomendações', async ({
  page,
}) => {
  const email = uniqueEmail('perfil');
  await signUp(page, 'Paulo Teste', email);
  await completeOnboarding(page);
  await page.goto('/app/perfil');
  await page
    .locator('label', { hasText: 'Fisiopatologia cardiovascular' })
    .filter({ has: page.locator('input[name=disciplineIds]') })
    .click();
  await page.getByRole('button', { name: 'Salvar perfil' }).click();
  await expect(page.getByText('Perfil salvo.')).toBeVisible();
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Fisiopatologia cardiovascular' })).toBeVisible();
});
