import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { eq, schema as s } from '@gutta/db';
import { completeOnboarding, ownerDb, setFeatures, signUp, uniqueEmail } from './helpers';

// Material de estudo e busca (SPEC v2, 5.10; plano, itens 52 a 54).
const AULA = path.join(import.meta.dirname, '../../worker/test/fixtures/aula.pdf');
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()).violations;

test.describe('material de estudo', () => {
  test.beforeAll(() => setFeatures(['materiais', 'meu_espaco']));
  test.afterAll(() => setFeatures([]));

  test('anexa, acha pelo conteúdo sem acento, favorita, lixeira e Ctrl+K @celular', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signUp(page, 'Lia', uniqueEmail('materiais'));
    await page.goto('/app');
    await completeOnboarding(page);

    await page.getByRole('link', { name: 'Material de estudo', exact: true }).click();
    await expect(page.getByText('Nada por aqui.')).toBeVisible();
    await page.getByRole('button', { name: 'Anexar material' }).click();
    const dialog = page.getByRole('dialog', { name: 'Anexar material' });
    await dialog.getByLabel('Arquivo').setInputFiles(AULA);
    await dialog.getByLabel('Título').fill('Slides de inflamação');
    await dialog.getByLabel('Disciplina').selectOption({ index: 1 });
    await dialog.getByLabel('Tema').fill('Inflamação');
    await dialog.getByLabel('Professor').fill('Dra. Juliana');
    expect(await axe(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Anexar' }).click();
    await expect(page.getByRole('link', { name: 'Slides de inflamação' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Do professor')).toBeVisible();

    // Busca pelo conteúdo da página 2, sem acento; o worker extrai o texto em segundo plano.
    await expect
      .poll(
        async () => {
          await page.goto('/app/busca?q=mediadores+quimicos');
          return page.getByRole('link', { name: 'Slides de inflamação, página 2' }).count();
        },
        { timeout: 45_000 },
      )
      .toBe(1);
    await expect(page.locator('mark').first()).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await page.getByRole('link', { name: 'Slides de inflamação, página 2' }).click();
    await expect(page.getByRole('heading', { name: 'Slides de inflamação' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Página 2' })).toBeVisible({ timeout: 15_000 });

    // Favorito, lixeira e restaurar.
    await page.goto('/app/materiais');
    await page.getByRole('button', { name: 'Favoritar Slides de inflamação' }).click();
    await page.getByRole('link', { name: 'Favoritos' }).click();
    await expect(page.getByRole('link', { name: 'Slides de inflamação' })).toBeVisible();
    await page.getByRole('button', { name: 'Mandar para a lixeira' }).click();
    await expect(page.getByText('Nada por aqui.')).toBeVisible();
    await page.getByRole('link', { name: 'Lixeira' }).click();
    await page.getByRole('button', { name: 'Restaurar' }).click();
    await expect(page.getByText('Nada por aqui.')).toBeVisible();
    await page.getByRole('link', { name: 'Minha biblioteca' }).click();
    await expect(page.getByRole('link', { name: 'Slides de inflamação' })).toBeVisible();

    // Ctrl+K leva à busca.
    await page.keyboard.press('Control+k');
    await expect(page).toHaveURL(/\/app\/busca/);
  });

  test('conteúdo de aula: anexa numa aula passada do cronograma', async ({ page }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail('planner');
    await signUp(page, 'Ivo', email);
    await page.goto('/app');
    await completeOnboarding(page);
    // Uma aula já passada na disciplina do aluno, como se viesse do cronograma.
    const db = ownerDb();
    const user = await db.query.authUsers.findFirst({ where: eq(s.authUsers.email, email) });
    const disc = await db.query.enrolledDisciplines.findFirst({
      where: eq(s.enrolledDisciplines.ownerId, user!.id),
    });
    await db.insert(s.lessons).values({
      ownerId: user!.id,
      disciplineId: disc!.id,
      title: 'Débito cardíaco',
      startsAt: new Date(Date.now() - 7 * 86_400_000),
      origin: 'imported',
    });

    await page.goto('/app/materiais');
    await page.getByRole('link', { name: disc!.name }).click();
    await expect(
      page.getByRole('heading', { name: `Conteúdo de aula: ${disc!.name}` }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Anexar material à aula Débito cardíaco' }).click();
    const dialog = page.getByRole('dialog', { name: 'Anexar material' });
    await expect(dialog.getByText('Aula: Débito cardíaco')).toBeVisible();
    await dialog.getByLabel('Arquivo').setInputFiles(AULA);
    await dialog.getByLabel('Título').fill('Slides do débito');
    await dialog.getByRole('button', { name: 'Anexar' }).click();
    const row = page.getByRole('row').filter({ hasText: 'Débito cardíaco' });
    await expect(row.getByRole('link', { name: 'Slides do débito' })).toBeVisible({
      timeout: 30_000,
    });
    expect(await axe(page)).toEqual([]);
  });
});
