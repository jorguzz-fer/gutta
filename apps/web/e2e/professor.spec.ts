import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding, promote, signUp, uniqueEmail } from './helpers';

async function scan(page: Page, name: string) {
  const res = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const issues = res.violations.map(
    (v) =>
      `${v.id}: ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(' | ')}`,
  );
  expect(issues, `${name}\n${issues.join('\n')}`).toEqual([]);
}

test('professor cria turma, aluno entra pelo código e aparece no painel', async ({
  page,
  browser,
  baseURL,
}) => {
  const teacherEmail = uniqueEmail('profe');
  await signUp(page, 'Helena Professora', teacherEmail);
  await promote(teacherEmail, 'teacher');
  await page.goto('/professor');
  await scan(page, 'professor');
  await page.getByLabel('Nome da turma').fill('Fisiopato 4A');
  await page.getByRole('button', { name: 'Criar turma' }).click();
  await expect(page.getByText('Turma criada.')).toBeVisible();
  const code = (await page.locator('p.font-display').first().innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await scan(page, 'turma vazia');

  const student = await (await browser.newContext({ baseURL })).newPage();
  await signUp(student, 'Rui Aluno', uniqueEmail('aluno-turma'));
  await completeOnboarding(student);
  await student.goto('/app/perfil');
  await expect(student.getByText(/o professor passa a ver/)).toBeVisible();
  await student.getByLabel('Código da turma').fill('ERRADO');
  await student.getByRole('button', { name: 'Entrar na turma' }).click();
  await expect(student.getByText(/Não achamos turma ativa/)).toBeVisible();
  await student.getByLabel('Código da turma').fill(code.toLowerCase());
  await student.getByRole('button', { name: 'Entrar na turma' }).click();
  await expect(student.getByText('Você entrou na turma.')).toBeVisible();
  await expect(student.getByText('Fisiopato 4A')).toBeVisible();
  await scan(student, 'perfil com turma');

  await student.goto('/app/questoes/nova');
  await student.waitForURL(/sessao/);
  await student.locator('label:has(input[name=option])').first().click();
  await student.getByRole('button', { name: 'Responder' }).click();
  await expect(student.getByText(/Você acertou\.|Não foi dessa vez\./)).toBeVisible();

  await page.reload();
  const row = page.getByRole('row').filter({ hasText: 'Rui' });
  await expect(row).toBeVisible();
  await expect(row.getByRole('cell').nth(2)).toHaveText('1');
  await expect(page.getByRole('heading', { name: 'Desempenho por assunto' })).toBeVisible();
  await scan(page, 'turma com aluno');

  await student.goto('/app/perfil');
  await student.getByRole('button', { name: 'Sair da turma' }).click();
  await expect(student.getByText(/O professor não vê mais/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'Rui' })).toHaveCount(0);
});

test('aluno sem papel de professor não abre o painel', async ({ page }) => {
  await signUp(page, 'Sem Papel', uniqueEmail('sem-papel'));
  await completeOnboarding(page);
  await page.goto('/professor');
  await expect(page).toHaveURL(/\/app\?aviso=sem-acesso/);
});
