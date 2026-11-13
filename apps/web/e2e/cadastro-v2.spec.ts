import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fakeCpf, setFeatures, signUp, uniqueEmail } from './helpers';

// Cadastro da v2 (SPEC v2, 5.1; plano, item 39): conta nova, dados pessoais com CPF e
// telefone, perfil acadêmico com qualquer curso da saúde e objetivo, e o app liberado.
test.describe('cadastro da v2', () => {
  test.beforeAll(() => setFeatures(['cadastro']));
  test.afterAll(() => setFeatures([]));

  test('conta nova até o app, retomando de onde parou @celular', async ({ page }) => {
    const email = uniqueEmail('cad-v2');
    await signUp(page, 'Bruna', email);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/comecar\/dados/);
    await expect(page.getByRole('navigation', { name: 'Etapas do cadastro' })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze())
        .violations,
    ).toEqual([]);

    await page.getByLabel('Nome completo').fill('Bruna Ferreira');
    await page.getByLabel('CPF').fill('529.982.247-24');
    await page.getByLabel('Telefone com DDD').fill('(11) 98765-4321');
    await page.getByRole('button', { name: 'Salvar e continuar' }).click();
    await expect(page.getByText('CPF inválido. Confira os números.')).toBeVisible();
    // O erro não apaga o que o aluno digitou.
    await expect(page.getByLabel('Nome completo')).toHaveValue('Bruna Ferreira');
    await expect(page.getByLabel('Telefone com DDD')).toHaveValue('(11) 98765-4321');

    const cpf = fakeCpf();
    await page.getByLabel('CPF').fill(cpf);
    await page.getByRole('button', { name: 'Salvar e continuar' }).click();
    await expect(page).toHaveURL(/\/comecar\/perfil/);

    // Sair e voltar: retoma no perfil, e o CPF aparece só mascarado.
    await page.goto('/comecar');
    await expect(page).toHaveURL(/\/comecar\/perfil/);
    await page.getByRole('link', { name: 'Voltar para os dados pessoais' }).click();
    await expect(page.getByText(`Salvo: ***.***.***-${cpf.slice(-2)}`)).toBeVisible();
    await expect(page.locator('body')).not.toContainText(cpf);
    await page.getByRole('button', { name: 'Salvar e continuar' }).click();
    await expect(page).toHaveURL(/\/comecar\/perfil/);

    await page.getByLabel('Curso de graduação').selectOption({ label: 'Enfermagem' });
    await page.getByLabel('Semestre').selectOption('3');
    await page.getByLabel('Instituição').selectOption({ index: 1 });
    await page.getByLabel('Turma').fill('XIIA');
    await page.getByRole('radio', { name: 'Organizar minha rotina' }).check();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.getByRole('button', { name: 'Salvar e continuar' }).click();
    await page.waitForURL((u) => u.pathname === '/app');
  });

  test('com a chave desligada, o onboarding do MVP continua', async ({ page }) => {
    await setFeatures([]);
    const email = uniqueEmail('cad-mvp');
    await signUp(page, 'Caio', email);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/onboarding/);
    await setFeatures(['cadastro']);
  });
});
