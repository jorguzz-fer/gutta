import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding, setFeatures, signUp, uniqueEmail } from './helpers';
import { pagesPdf } from './pdf';

// Busca por conceito (SPEC v2, MAT-09; ADR 0014; plano, item 66). O worker do E2E usa o
// provedor de vetores de teste (sem rede): "glóbulos brancos" acha a página de "leucócitos".
const SLIDES = pagesPdf([
  ['Imunologia', 'Os leucocitos migram para o tecido inflamado.'],
  ['Coracao', 'O no sinusal inicia o impulso eletrico.'],
]);

async function axe(page: Page, where: string) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const v = (
      await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
    ).violations.map((x) => `${where} (${colorScheme}): ${x.id}`);
    expect(v).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: null });
}

test.describe('busca por conceito', () => {
  test.beforeAll(() => setFeatures(['materiais']));
  test.afterAll(() => setFeatures([]));

  test('autorizar e achar pelo assunto o que não tem a palavra @celular', async ({ page }) => {
    test.setTimeout(120_000);
    await signUp(page, 'Leo', uniqueEmail('conceito'));
    await page.goto('/app');
    await completeOnboarding(page);

    await page.goto('/app/materiais');
    await page.getByRole('button', { name: 'Anexar material' }).click();
    const dialog = page.getByRole('dialog', { name: 'Anexar material' });
    await dialog
      .getByLabel('Arquivo')
      .setInputFiles({ name: 'imuno.pdf', mimeType: 'application/pdf', buffer: SLIDES });
    await dialog.getByLabel('Título').fill('Slides de imunologia');
    await dialog.getByLabel('Disciplina').selectOption({ index: 1 });
    await dialog.getByRole('button', { name: 'Anexar' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // Sem autorização, a busca por palavra não acha e a busca por assunto é oferecida.
    await page.goto('/app/busca?q=gl%C3%B3bulos+brancos');
    await expect(page.getByText('Nada encontrado para “glóbulos brancos”.')).toBeVisible();
    await axe(page, 'busca sem autorização');
    await page.getByRole('button', { name: 'Autorizar a busca por assunto' }).click();
    await expect(
      page.getByText(/Autorizado\. Seus materiais estão sendo preparados/),
    ).toBeVisible();

    // O worker gera os vetores; a página de leucócitos aparece pelo assunto.
    const hit = page.getByRole('link', { name: 'Slides de imunologia, página 1' });
    await expect
      .poll(
        async () => {
          await page.goto('/app/busca?q=gl%C3%B3bulos+brancos');
          return hit.count();
        },
        { timeout: 60_000 },
      )
      .toBe(1);
    await expect(page.getByText('Por assunto').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Slides de imunologia, página 2' })).toHaveCount(0);
    await axe(page, 'busca por assunto');
    await hit.click();
    await expect(page).toHaveURL(/pagina=1/);
  });
});
