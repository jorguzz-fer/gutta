import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding, setFeatures, signUp, uniqueEmail } from './helpers';

// Faltas (SPEC v2, 5.12; plano, item 48). Exemplo do documento: 80 h, 75%, limite 20.
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()).violations;

test.describe('faltas', () => {
  test.beforeAll(() => setFeatures(['faltas', 'meu_espaco', 'lembretes']));
  test.afterAll(() => setFeatures([]));

  test('configura, registra, vê o saldo e o aviso de limiar @celular', async ({ page }) => {
    test.setTimeout(90_000);
    await signUp(page, 'Ana', uniqueEmail('faltas'));
    await page.goto('/app');
    await completeOnboarding(page);

    await page.getByRole('link', { name: 'Faltas', exact: true }).click();
    await expect(page.getByText('Ainda sem configuração.')).toBeVisible();
    await page.getByRole('link', { name: 'Fisiologia cardiovascular' }).click();
    await expect(page.getByText('Configure a carga horária')).toBeVisible();

    await page.goto(`${page.url()}?mes=2026-11`);
    await page.getByLabel('Carga horária (horas-aula)').fill('80');
    await page.getByLabel('Frequência mínima exigida').selectOption('75');
    await page.getByLabel('Horas-aula por encontro').fill('2');
    await page.getByRole('checkbox', { name: 'segunda' }).check();
    await page.getByRole('checkbox', { name: 'quarta' }).check();
    await page.getByRole('button', { name: 'Salvar configuração' }).click();
    await expect(page.getByText('Dentro do limite')).toBeVisible();
    expect(await axe(page)).toEqual([]);

    // Duas faltas de 2 horas-aula: 4 de 20, saldo 16.
    for (const d of ['04/11/2026', '11/11/2026']) {
      await page.getByRole('button', { name: `${d}, dia de aula` }).click();
      await page.getByRole('button', { name: 'Registrar falta' }).click();
      await expect(
        page.getByRole('button', { name: `${d}, dia de aula, falta registrada` }),
      ).toBeVisible();
    }
    const ind = page.getByRole('region', { name: 'Indicadores' });
    await expect(ind.getByText('20', { exact: true })).toBeVisible();
    await expect(ind.getByText('4', { exact: true })).toBeVisible();
    await expect(ind.getByText('16', { exact: true })).toBeVisible();
    await expect(page.getByText('20% do limite usado.')).toBeVisible();

    // Mais três aulas de 2 horas-aula: 10 de 20, metade do limite (aviso de 50%).
    for (const d of ['02/11/2026', '09/11/2026', '16/11/2026']) {
      await page.getByRole('button', { name: `${d}, dia de aula` }).click();
      await page.getByRole('button', { name: 'Registrar falta' }).click();
      await expect(
        page.getByRole('button', { name: `${d}, dia de aula, falta registrada` }),
      ).toBeVisible();
    }
    await expect(page.getByText('Perto do limite')).toBeVisible();
    await page.goto('/app/avisos');
    await expect(
      page.getByText('Faltas em Fisiologia cardiovascular: 50% do limite'),
    ).toBeVisible();
  });
});
