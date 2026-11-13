import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding, setFeatures, signUp, uniqueEmail } from './helpers';

// Notas e calculadora (SPEC v2, 5.13; plano, item 49).
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()).violations;

test.describe('notas', () => {
  test.beforeAll(() => setFeatures(['notas', 'meu_espaco']));
  test.afterAll(() => setFeatures([]));

  test('lança notas por peso, pendente não vale zero, e o simulador dá 7,75 @celular', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signUp(page, 'Teo', uniqueEmail('notas'));
    await page.goto('/app');
    await completeOnboarding(page);
    await page.getByRole('link', { name: 'Notas', exact: true }).click();
    await page.getByRole('link', { name: 'Fisiologia cardiovascular' }).click();
    await expect(page.getByText('Nenhuma nota lançada ainda.')).toBeVisible();

    const add = async (name: string, date: string, grade: string, weight: string) => {
      await page.getByLabel('Nome da atividade ou prova').fill(name);
      await page.getByLabel('Data', { exact: true }).fill(date);
      await page.getByLabel('Nota (0 a 10)').fill(grade);
      await page.getByLabel('Peso', { exact: true }).fill(weight);
      await page.getByRole('button', { name: 'Adicionar avaliação' }).click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    };
    await add('P1', '2026-09-12', '6', '3');
    await add('P2', '2026-10-28', '7', '3');
    await add('P3', '2026-11-30', '', '4');

    const stats = page.getByRole('region', { name: 'Meu desempenho' });
    await expect(stats.getByText('6,5', { exact: true })).toBeVisible();
    await expect(stats.getByText('2 de 3')).toBeVisible();
    await expect(
      page.getByText('Para chegar a 7,0, você precisa de 7,75 em média nas avaliações restantes.'),
    ).toBeVisible();
    await expect(page.getByText('Pendente', { exact: true })).toBeVisible();
    expect(await axe(page)).toEqual([]);

    // Simulador com os números da disciplina já preenchidos: 7,75.
    const simulador = page.getByRole('region', { name: 'Quanto preciso tirar?' });
    await expect(simulador.getByText('7,75', { exact: true })).toBeVisible();
    await simulador.getByLabel('Média final desejada').fill('9');
    await expect(simulador.getByText(/não é alcançável/)).toBeVisible();

    // Lança a P3 e a média passa a ser final.
    await page.getByRole('button', { name: 'Lançar ou editar nota de P3' }).click();
    await page.getByLabel('Nota de P3 (0 a 10,0)').fill('8');
    await page.getByRole('button', { name: 'Salvar nota' }).click();
    await expect(page.getByText('Média 7,1, acima da mínima de 7,0.')).toBeVisible();
  });
});
