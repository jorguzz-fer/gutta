import { expect, test } from '@playwright/test';
import { completeOnboarding, promote, signIn, signUp, uniqueEmail } from './helpers';

// J05: editor cria → envia para revisão → revisor aprova e publica → aluno estuda a questão.
test('editor escreve, revisor publica, aluno responde', async ({ browser }) => {
  const editorEmail = uniqueEmail('editor');
  const reviewerEmail = uniqueEmail('revisor');
  const studentEmail = uniqueEmail('estudo');
  const stem = `E2E ${Date.now()}: qual valva separa o átrio e o ventrículo esquerdos?`;

  const editor = await browser.newPage();
  await signUp(editor, 'Edu Editor', editorEmail);
  await promote(editorEmail, 'editor');
  await editor.goto('/admin/questoes/nova');
  await editor.getByLabel('Assunto').selectOption({ label: 'Ciclo cardíaco' });
  await editor.getByLabel('Enunciado').fill(stem);
  const opts = [
    ['Mitral', 'Fica entre átrio e ventrículo esquerdos.'],
    ['Tricúspide', 'É do lado direito.'],
    ['Aórtica', 'Separa VE e aorta.'],
  ];
  await editor.getByRole('button', { name: 'Remover alternativa D' }).click();
  for (const [i, [body, why]] of opts.entries()) {
    await editor.getByLabel(`Texto da alternativa ${'ABC'[i]}`).fill(body!);
    await editor.getByLabel(`Explicação da alternativa ${'ABC'[i]}`).fill(why!);
  }
  await expect(editor.getByText(/falta marcar a correta/)).toBeVisible();
  await editor.locator('input[name=correct]').first().check();
  await editor.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(editor.getByText('Rascunho salvo.')).toBeVisible();
  const questionUrl = editor.url().split('?')[0]!;
  const questionId = questionUrl.split('/').pop()!;

  // Rascunho não aparece no estudo.
  const student = await browser.newPage();
  await signUp(student, 'Sara Estudante', studentEmail);
  await completeOnboarding(student);
  const draftAttempt = await student.request.post('/api/v1/questions/sessions', {
    data: { questionId },
  });
  expect(draftAttempt.status()).toBe(404);

  await editor.getByRole('button', { name: 'Enviar para revisão' }).click();
  await expect(editor.getByText('Status atualizado.')).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);
  // Editor não publica nem pela API.
  const forced = await editor.request.post(`/api/v1/admin/questions/${questionId}/publish`);
  expect(forced.status()).toBe(403);

  const reviewer = await browser.newPage();
  await signUp(reviewer, 'Rita Revisora', reviewerEmail);
  await promote(reviewerEmail, 'reviewer');
  await reviewer.goto('/admin/questoes');
  await reviewer.getByText(stem).click();
  await reviewer.getByRole('button', { name: 'Aprovar' }).click();
  await expect(reviewer.getByText('Status atualizado.')).toBeVisible();
  await reviewer.getByRole('button', { name: 'Publicar' }).click();
  await expect(reviewer.getByText('Publicada', { exact: true })).toBeVisible();

  await student.goto(`/app/questoes/nova?questao=${questionId}`);
  await expect(student.getByRole('heading', { name: stem })).toBeVisible();
  await student.locator('label', { hasText: 'Mitral' }).click();
  await student.getByRole('button', { name: 'Responder' }).click();
  await expect(student.getByText('Você acertou.')).toBeVisible();
  await expect(student.getByText('Fica entre átrio e ventrículo esquerdos.')).toBeVisible();
});

test('admin precisa de 2FA e acessa as métricas com o código do app', async ({ page, browser }) => {
  const { totp } = await import('./helpers');
  const email = uniqueEmail('admin');
  await signUp(page, 'Ana Admin', email);
  await promote(email, 'admin');
  await page.goto('/admin/metricas');
  await expect(page).toHaveURL(/\/seguranca\/dois-fatores/);
  await page.getByLabel('Confirme sua senha').fill('senha-e2e-segura-1');
  await page.getByRole('button', { name: 'Continuar' }).click();
  const secret = (await page.locator('code').innerText()).trim();
  await page.getByLabel('Código de 6 dígitos do app').fill(totp(secret));
  await page.getByRole('button', { name: 'Ativar', exact: true }).click();
  await expect(page.getByText('Verificação em duas etapas ativa.')).toBeVisible();

  const fresh = await browser.newPage();
  await signIn(fresh, email, undefined, '/admin/metricas');
  await expect(fresh).toHaveURL(/\/entrar\/dois-fatores/);
  await fresh.getByLabel('Código de 6 dígitos').fill('000000');
  await fresh.getByRole('button', { name: 'Confirmar' }).click();
  await expect(fresh.getByText(/Código incorreto/)).toBeVisible();
  await fresh.getByLabel('Código de 6 dígitos').fill(totp(secret));
  await fresh.getByRole('button', { name: 'Confirmar' }).click();
  await expect(fresh.getByRole('heading', { name: 'Métricas' })).toBeVisible();
  await expect(fresh.getByText('Estudantes ativos na semana (WALS)')).toBeVisible();
});
