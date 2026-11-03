import { expect, test } from '@playwright/test';
import { completeOnboarding, signUp, uniqueEmail } from './helpers';

test('visitante não acessa área logada nem API privada', async ({ page, request }) => {
  await page.goto('/app/questoes');
  await expect(page).toHaveURL(/\/entrar\?next=%2Fapp%2Fquestoes/);
  for (const path of [
    '/api/v1/questions/sessions',
    '/api/v1/flashcards/due',
    '/api/v1/me/export',
    '/api/v1/admin/questions',
  ]) {
    const r = await request.get(path);
    expect(r.status(), path).toBe(401);
    expect(await r.json()).toMatchObject({
      code: 'unauthenticated',
      requestId: expect.any(String),
    });
  }
});

test('mutação vinda de outra origem é recusada (CSRF)', async ({ request }) => {
  const r = await request.post('/api/v1/questions/attempts', {
    headers: { origin: 'https://ataque.example' },
    data: {},
  });
  expect(r.status()).toBe(403);
  expect((await r.json()).code).toBe('forbidden_origin');
});

test('aluno não entra no editorial e não vê sessão de outro aluno', async ({ browser }) => {
  const a = await browser.newPage();
  await signUp(a, 'Aluno A', uniqueEmail('a'));
  await completeOnboarding(a);
  const created = await a.request.post('/api/v1/questions/sessions', { data: {} });
  const { sessionId } = await created.json();

  const b = await browser.newPage();
  await signUp(b, 'Aluno B', uniqueEmail('b'));
  await completeOnboarding(b);
  await b.goto('/admin');
  await expect(b).toHaveURL(/\/app\?aviso=sem-acesso/);
  const peek = await b.request.get(`/api/v1/questions/sessions/${sessionId}/next`);
  expect(peek.status()).toBe(404);
  const adminApi = await b.request.get('/api/v1/admin/questions');
  expect(adminApi.status()).toBe(403);
});

test('cadastro não revela se o e-mail já tem conta', async ({ page }) => {
  await page.goto('/cadastro');
  await page.getByLabel('Como quer ser chamado(a)').fill('Alguém');
  await page.getByLabel('E-mail').fill('aluno@gutta.test');
  await page.getByLabel('Senha', { exact: true }).fill('qualquer-senha-1');
  await page.getByRole('checkbox', { name: /termos de uso/ }).check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada. Confira seu e-mail.')).toBeVisible();
});

test('cabeçalhos de segurança', async ({ request }) => {
  const r = await request.get('/');
  const h = r.headers();
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['content-security-policy']).toContain('https://aula.alumine.com.br');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-powered-by']).toBeUndefined();
});

test('olho do campo de senha mostra e esconde o que foi digitado', async ({ page }) => {
  await page.goto('/entrar');
  const field = page.getByLabel('Senha', { exact: true });
  await field.fill('segredo-123');
  await expect(field).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Mostrar senha' }).click();
  await expect(field).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Ocultar senha' }).click();
  await expect(field).toHaveAttribute('type', 'password');
});
