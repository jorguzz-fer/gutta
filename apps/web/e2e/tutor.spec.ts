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
