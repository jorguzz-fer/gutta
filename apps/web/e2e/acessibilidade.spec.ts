import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding, signUp, uniqueEmail } from './helpers';

// Varredura automática WCAG 2.2 A/AA no fluxo principal. Não substitui a revisão manual (SPEC §17.1).
async function scan(page: Page, name: string) {
  const res = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const issues = res.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(' | ')}`,
  );
  expect(issues, `${name}\n${issues.join('\n')}`).toEqual([]);
}

test('acessibilidade do fluxo principal @celular', async ({ page }) => {
  await page.goto('/');
  await scan(page, 'landing');
  await page.goto('/entrar');
  await scan(page, 'entrar');
  await page.goto('/cadastro');
  await scan(page, 'cadastro');

  await signUp(page, 'Clara Acessível', uniqueEmail('a11y'));
  await scan(page, 'onboarding');
  await completeOnboarding(page);
  await scan(page, 'painel');
  await page.goto('/app/disciplinas/fisiologia-cardiovascular/ciclo-cardiaco');
  await scan(page, 'módulo');
  await page.goto('/app/questoes/nova');
  await page.waitForURL(/sessao/);
  await expect(page.getByText(/Questão 1 de/)).toBeVisible();
  await scan(page, 'questão');
  await page.locator('label:has(input[name=option])').first().click();
  await page.getByRole('button', { name: 'Responder' }).click();
  await expect(page.getByText(/Você acertou\.|Não foi dessa vez\./)).toBeVisible();
  await scan(page, 'feedback');
  await page.goto('/app/revisoes');
  await page.getByRole('button', { name: 'Mostrar resposta' }).waitFor();
  await scan(page, 'revisões');
  await page.goto('/app/privacidade');
  await scan(page, 'privacidade');
});

test('navegação por teclado: pular para o conteúdo e responder questão sem mouse', async ({
  page,
}) => {
  await signUp(page, 'Teo Teclado', uniqueEmail('kbd'));
  await completeOnboarding(page);
  await page.goto('/app');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
  await page.goto('/app/questoes/nova');
  await page.waitForURL(/sessao/);
  await expect(page.getByText(/Questão 1 de/)).toBeVisible();
  await page.keyboard.press('2');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Você acertou\.|Não foi dessa vez\./)).toBeVisible();
});
