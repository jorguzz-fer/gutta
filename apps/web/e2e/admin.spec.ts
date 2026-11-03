import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { promote, signUp, totp, uniqueEmail } from './helpers';

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

async function becomeAdmin(page: Page) {
  const email = uniqueEmail('adm-crud');
  await signUp(page, 'Carla Admin', email);
  await promote(email, 'admin');
  await page.goto('/admin/cursos');
  await expect(page).toHaveURL(/\/seguranca\/dois-fatores/);
  await page.getByLabel('Confirme sua senha').fill('senha-e2e-segura-1');
  await page.getByRole('button', { name: 'Continuar' }).click();
  const secret = (await page.locator('code').innerText()).trim();
  await page.getByLabel('Código de 6 dígitos do app').fill(totp(secret));
  await page.getByRole('button', { name: 'Ativar', exact: true }).click();
  await expect(page.getByText('Verificação em duas etapas ativa.')).toBeVisible();
  return email;
}

test('admin cria curso, disciplina, assunto e módulo, e o módulo nasce rascunho', async ({
  page,
}) => {
  await becomeAdmin(page);
  const tag = Date.now().toString(36);
  await page.goto('/admin/cursos');
  await scan(page, 'cursos');
  await page.getByLabel('Nome').fill(`Odontologia ${tag}`);
  await page.getByRole('button', { name: 'Criar curso' }).click();
  await expect(page.getByText('Curso criado.')).toBeVisible();
  await expect(page.getByRole('heading', { name: `Odontologia ${tag}` })).toBeVisible();

  await page.getByLabel('Nome', { exact: true }).first().fill('Anatomia dental');
  await page.getByLabel('Semestre sugerido').fill('1');
  await page.getByRole('button', { name: 'Criar disciplina' }).click();
  await expect(page.getByText('Disciplina criada.')).toBeVisible();

  await page.getByLabel('Novo assunto').fill('Dentição decídua');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText('Assunto criado.')).toBeVisible();
  await scan(page, 'disciplina');

  await page.getByLabel('Título').fill('Erupção dos dentes de leite');
  await page.getByLabel('Assunto', { exact: true }).selectOption({ label: 'Dentição decídua' });
  await page.getByRole('button', { name: 'Criar como rascunho' }).click();
  await expect(page.getByText('Módulo criado como rascunho.')).toBeVisible();
  await expect(page.getByText('Rascunho', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar para revisão' }).click();
  await expect(page.getByText('Em revisão', { exact: true })).toBeVisible();
  await expect(page.getByText(/a aprovação precisa ser de outra pessoa/)).toBeVisible();
  await page.getByRole('button', { name: 'Aprovar' }).click();
  await expect(page.getByText(/autor não aprova o próprio conteúdo/i)).toBeVisible();
  await scan(page, 'módulo');
});

test('admin dá o papel de professor e cria uma instituição', async ({ page, browser }) => {
  const other = await browser.newPage();
  const otherEmail = uniqueEmail('prof');
  await signUp(other, 'Paulo Professor', otherEmail);
  await other.close();

  await becomeAdmin(page);
  await page.goto(`/admin/usuarios?q=${encodeURIComponent(otherEmail)}`);
  await scan(page, 'usuários');
  await page.getByRole('link', { name: 'Paulo Professor' }).click();
  await scan(page, 'usuário');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Professor' })
    .getByRole('button', { name: 'Dar papel' })
    .click();
  await expect(page.getByText('Papéis atualizados.')).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Professor' }).getByText('ativo'),
  ).toBeVisible();

  await page.goto('/admin/instituicoes');
  await scan(page, 'instituições');
  await page.getByLabel('Nome').last().fill(`Faculdade E2E ${Date.now()}`);
  await page.getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByText('Instituição criada.')).toBeVisible();
});
