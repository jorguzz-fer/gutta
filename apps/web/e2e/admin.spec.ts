import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { becomeAdmin, signIn, signUp, uniqueEmail } from './helpers';

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

test('admin cria conta com senha temporária e a pessoa troca a senha', async ({
  page,
  browser,
  baseURL,
}) => {
  await becomeAdmin(page);
  await page.goto('/admin/usuarios');
  const email = uniqueEmail('criado');
  const name = `Beatriz ${Date.now().toString(36)}`;
  const form = page.getByRole('region', { name: 'Novo usuário' });
  await form.getByLabel('Nome', { exact: true }).fill(name);
  await form.getByLabel('E-mail', { exact: true }).fill(email);
  await form.getByLabel('Papel', { exact: true }).selectOption({ label: 'Professor' });
  await form.getByRole('button', { name: 'Criar conta' }).click();
  await expect(form.getByText(/Conta criada para/)).toBeVisible();
  const temp = (await form.locator('code').innerText()).trim();
  expect(temp).toMatch(/^[A-Za-z0-9]{14}$/);
  await expect(page.getByRole('link', { name })).toBeVisible();
  await scan(page, 'usuário criado');

  await form.getByLabel('E-mail', { exact: true }).fill(email);
  await form.getByLabel('Nome', { exact: true }).fill('Beatriz Repetida');
  await form.getByRole('button', { name: 'Criar conta' }).click();
  await expect(form.getByText('Já existe uma conta com esse e-mail.')).toBeVisible();

  const other = await (await browser.newContext({ baseURL })).newPage();
  await signIn(other, email, temp, '/seguranca/senha');
  await expect(other.getByRole('heading', { name: 'Trocar senha' })).toBeVisible();
  await other.getByLabel('Senha atual').fill(temp);
  await other.getByLabel('Nova senha').fill('nova-senha-da-bia-1');
  await other.getByRole('button', { name: 'Trocar senha' }).click();
  await expect(other.getByText(/Senha trocada/)).toBeVisible();
  await scan(other, 'trocar senha');
  await other.goto('/professor');
  await expect(other.getByRole('heading', { name: /turmas/i }).first()).toBeVisible();
});
