import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { becomeAdmin, completeOnboarding, PASSWORD, signUp, uniqueEmail } from './helpers';

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

test('pedido do titular: aluno pede correção, admin responde, aluno vê a resposta', async ({
  page,
  browser,
  baseURL,
}) => {
  await signUp(page, 'Lia Titular', uniqueEmail('titular'));
  await completeOnboarding(page);
  await page.goto('/app/privacidade');
  await scan(page, 'privacidade');
  await page.getByLabel('Tipo de pedido').selectOption({ label: 'Corrigir dados' });
  await page.getByLabel('O que você precisa').fill('Minha instituição aparece errada no perfil.');
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(page.getByText(/Pedido registrado/)).toBeVisible();
  await expect(page.getByText(/resposta até/)).toBeVisible();

  const adm = await (await browser.newContext({ baseURL })).newPage();
  await becomeAdmin(adm, 'Davi DPO');
  await adm.goto('/admin/privacidade');
  await scan(adm, 'admin privacidade');
  const item = adm.getByRole('listitem').filter({ hasText: 'Lia Titular' });
  await expect(item.getByText(/prazo .* 15 dias/)).toBeVisible();
  await item
    .getByLabel('Resposta para Lia Titular')
    .fill('Corrigimos a instituição no seu perfil.');
  await item.getByRole('button', { name: 'Responder e encerrar' }).click();
  await expect(adm.getByText(/Pedido respondido/)).toBeVisible();

  await page.reload();
  await expect(page.getByText('Corrigimos a instituição no seu perfil.')).toBeVisible();
  await expect(page.getByText('respondido', { exact: true })).toBeVisible();
});

test('exclusão: aluno pede, admin executa e a conta deixa de existir', async ({
  page,
  browser,
  baseURL,
}) => {
  const email = uniqueEmail('excluir');
  await signUp(page, 'Edu Excluído', email);
  await completeOnboarding(page);
  await page.goto('/app/privacidade');
  await page.getByLabel('Para confirmar, digite EXCLUIR').fill('EXCLUIR');
  await page.getByRole('button', { name: 'Pedir exclusão' }).click();
  await expect(page.getByText(/Pedido de exclusão registrado em/)).toBeVisible();

  const adm = await (await browser.newContext({ baseURL })).newPage();
  await becomeAdmin(adm, 'Ivo Admin');
  await adm.goto('/admin/privacidade');
  const item = adm.getByRole('listitem').filter({ hasText: 'Edu Excluído' });
  await item.getByLabel('Para excluir Edu Excluído agora, digite EXCLUIR').fill('EXCLUIR');
  await item.getByRole('button', { name: 'Excluir agora' }).click();
  await expect(adm.getByText(/Conta excluída/)).toBeVisible();
  await expect(adm.getByRole('listitem').filter({ hasText: 'Edu Excluído' })).toHaveCount(0);

  const again = await (await browser.newContext({ baseURL })).newPage();
  await again.goto('/entrar');
  await again.getByLabel('E-mail').fill(email);
  await again.getByLabel('Senha').fill(PASSWORD);
  await again.getByRole('button', { name: 'Entrar' }).click();
  await expect(again.getByText('E-mail ou senha incorretos.')).toBeVisible();
});

test('política pública mostra bases legais, retenção e o que falta definir', async ({ page }) => {
  await page.goto('/politica-de-privacidade');
  await expect(page.getByRole('heading', { name: 'Por quanto tempo guardamos' })).toBeVisible();
  await expect(page.getByText(/Consentimento específico/)).toBeVisible();
  await expect(page.getByText(/365 dias/)).toBeVisible();
  await expect(page.getByText(/a definir antes do piloto/).first()).toBeVisible();
  await scan(page, 'política');
});
