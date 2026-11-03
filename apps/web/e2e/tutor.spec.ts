import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { completeOnboarding, signUp, uniqueEmail } from './helpers';

// Tutor IA com o provedor de teste (AI_PROVIDER=fake no playwright.config).
test('aluno pergunta ao tutor no módulo e a conversa fica na tela @celular', async ({ page }) => {
  await signUp(page, 'Tais Tutorada', uniqueEmail('tutor'));
  await completeOnboarding(page, 'Fisiopatologia cardiovascular');
  await page.goto('/app/disciplinas/fisiopatologia-cardiovascular/miocardiopatia-hipertrofica');
  await expect(page.getByRole('heading', { name: /Tutor IA/ })).toBeVisible();
  await expect(page.getByText(/não orienta casos reais/)).toBeVisible();
  // Consentimento específico antes da primeira pergunta (transferência internacional).
  await expect(page.getByText(/vão para a Anthropic/)).toBeVisible();
  await expect(page.getByLabel('Sua dúvida')).toHaveCount(0);
  await page.getByRole('button', { name: 'Aceito usar o tutor' }).click();
  await page.getByLabel('Sua dúvida').fill('Por que a diástole é o problema principal?');
  await page.getByRole('button', { name: 'Perguntar ao tutor' }).click();
  await expect(page.getByText(/Pelo material de Miocardiopatia hipertrófica/)).toBeVisible();
  await expect(page.getByText('Por que a diástole é o problema principal?')).toBeVisible();
  await expect(page.getByText(/19 de 20 perguntas restantes/)).toBeVisible();
  // A aula interativa é de outro site (iframe): fora do que o app controla, fica fora da varredura.
  const res = await new AxeBuilder({ page })
    .exclude('iframe')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    res.violations.map(
      (v) =>
        `${v.id}: ${v.nodes.map((n) => n.target.join(' ') + ' ' + (n.failureSummary ?? '')).join(' | ')}`,
    ),
  ).toEqual([]);
});

test('aluno retira o aceite do tutor e apaga o texto das conversas em Privacidade', async ({
  page,
}) => {
  await signUp(page, 'Rita Retira', uniqueEmail('tutor-lgpd'));
  await completeOnboarding(page, 'Fisiopatologia cardiovascular');
  await page.goto('/app/disciplinas/fisiopatologia-cardiovascular/miocardiopatia-hipertrofica');
  await page.getByRole('button', { name: 'Aceito usar o tutor' }).click();
  await page.getByLabel('Sua dúvida').fill('O que piora o gradiente na via de saída?');
  await page.getByRole('button', { name: 'Perguntar ao tutor' }).click();
  await expect(page.getByText(/Pelo material de/)).toBeVisible();

  await page.goto('/app/privacidade');
  await page.getByRole('button', { name: 'Apagar conversas com o tutor' }).click();
  await expect(page.getByText('Texto de 2 mensagens apagado.')).toBeVisible();
  await page.getByRole('button', { name: 'Desligar: Tutor IA' }).click();
  await expect(page.getByText('Autorização retirada.')).toBeVisible();

  await page.goto('/app/disciplinas/fisiopatologia-cardiovascular/miocardiopatia-hipertrofica');
  await expect(page.getByText('O que piora o gradiente na via de saída?')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Aceito usar o tutor' })).toBeVisible();
});
