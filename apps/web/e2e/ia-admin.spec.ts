import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { eq, schema as s } from '@gutta/db';
import {
  becomeAdmin,
  completeOnboarding,
  ownerDb,
  setFeatures,
  signUp,
  uniqueEmail,
} from './helpers';

// Custos de IA no admin (SPEC v2, 7.7; plano, item 64): gasto por recurso, alerta acima de um
// valor e um interruptor por recurso, que vale na hora para o aluno.
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

test.describe('custos de IA', () => {
  test.beforeAll(() => setFeatures(['materiais', 'ajuda']));
  test.afterAll(async () => {
    await ownerDb().delete(s.appSettings).where(eq(s.appSettings.key, 'ai'));
    await setFeatures([]);
  });

  test('gasto por recurso, alerta e recurso pausado para o aluno', async ({ browser }) => {
    test.setTimeout(120_000);
    // Um aluno com uso registrado do tutor sobre os materiais.
    const student = await (await browser.newContext()).newPage();
    const email = uniqueEmail('ia-aluno');
    await signUp(student, 'Lia', email);
    await student.goto('/app');
    await completeOnboarding(student);
    const db = ownerDb();
    const u = await db.query.authUsers.findFirst({ where: eq(s.authUsers.email, email) });
    await db.insert(s.aiUsage).values({
      ownerId: u!.id,
      feature: 'tutor_materiais',
      model: 'teste',
      inputTokens: 1200,
      outputTokens: 300,
      costMicros: 42_000,
    });

    const admin = await (await browser.newContext()).newPage();
    await becomeAdmin(admin, 'Rui Admin');
    await admin.goto('/admin/ia');
    await expect(admin.getByRole('heading', { name: 'Custos de IA' })).toBeVisible();
    const row = admin.getByRole('row').filter({ hasText: 'Tutor sobre os materiais' });
    await expect(row).toContainText('US$');
    await axe(admin, 'custos');

    // Pausa a criação com IA e liga o alerta abaixo do gasto do mês.
    await admin.getByLabel('Criar com IA').uncheck();
    await admin.getByLabel('Alerta quando o gasto do mês passar de (US$)').fill('0,01');
    await admin.getByRole('button', { name: 'Salvar' }).click();
    await expect(admin.getByText('Configuração salva.')).toBeVisible();
    await expect(admin.getByText(/passou do valor do alerta/)).toBeVisible();
    await expect(admin.getByLabel('Criar com IA')).not.toBeChecked();
    await expect(admin.getByLabel('Tutor sobre os materiais')).toBeChecked();

    // O aluno recebe o aviso na hora; o tutor continua.
    const paused = await student.request.post('/api/v1/ajuda/jobs', {
      data: { type: 'resumo', materialIds: [randomUUID()] },
    });
    expect(paused.status()).toBe(503);
    expect((await paused.json()).message).toBe(
      'A criação com IA está pausada no momento. Tente de novo mais tarde.',
    );
    const tutor = await student.request.post('/api/v1/ajuda/tutor/threads', {
      data: { scope: 'materiais', materialIds: [randomUUID()] },
    });
    expect(tutor.status()).not.toBe(503);

    // Ligada de novo, o pedido volta a ser conferido normalmente.
    await admin.getByLabel('Criar com IA').check();
    await admin.getByRole('button', { name: 'Salvar' }).click();
    // A mensagem de salvo já estava na tela: espera o pedido do aluno mudar.
    await expect
      .poll(async () => {
        const r = await student.request.post('/api/v1/ajuda/jobs', {
          data: { type: 'resumo', materialIds: [randomUUID()] },
        });
        return r.status();
      })
      .not.toBe(503);
    await admin.reload();
    await expect(admin.getByLabel('Criar com IA')).toBeChecked();
  });
});
