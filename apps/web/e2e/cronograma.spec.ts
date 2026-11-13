import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { eq, schema as s } from '@gutta/db';
import { completeOnboarding, ownerDb, setFeatures, signUp, uniqueEmail } from './helpers';

// Cronograma lido pela IA e conferido pelo aluno (SPEC v2, DIS-05; plano, item 41). O worker
// roda de verdade, com o extrator de teste (lê linhas "DD/MM/AAAA HH:MM-HH:MM Tipo: título").
const CRONOGRAMA = path.join(import.meta.dirname, '../../worker/test/fixtures/cronograma.pdf');

test.describe('cronograma', () => {
  test.beforeAll(() => setFeatures(['disciplinas']));
  test.afterAll(() => setFeatures([]));

  test('envia, autoriza, confere, corrige e leva para a agenda', async ({ page }) => {
    const email = uniqueEmail('cronograma');
    await signUp(page, 'Diana', email);
    await page.goto('/app');
    await completeOnboarding(page);

    await page.goto('/app/minhas-disciplinas');
    await page.getByLabel('Nome da disciplina').fill('Fisiopatologia');
    await page.getByLabel('Cronograma').setInputFiles(CRONOGRAMA);
    await page.getByRole('button', { name: 'Adicionar disciplina' }).click();
    const card = page.getByRole('listitem').filter({ hasText: 'Fisiopatologia' }).first();

    // Sem autorização, nada vai para a IA.
    await expect(card).toContainText('a IA precisa ler o arquivo');
    await card.getByRole('button', { name: 'Autorizar a leitura' }).click();
    await card.getByRole('link', { name: 'Conferir o cronograma' }).click({ timeout: 45_000 });

    await expect(page.getByRole('heading', { name: 'Conferir cronograma' })).toBeVisible();
    const items = page.getByRole('list', { name: 'Itens do cronograma' }).getByRole('listitem');
    await expect(items).toHaveCount(5);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze())
        .violations,
    ).toEqual([]);

    // Nada entrou na agenda ainda.
    const db = ownerDb();
    const user = await db.query.authUsers.findFirst({ where: eq(s.authUsers.email, email) });
    expect(await db.select().from(s.lessons).where(eq(s.lessons.ownerId, user!.id))).toEqual([]);

    // Corrige a sala da primeira aula e deixa a entrega de fora.
    await items.nth(0).getByLabel('Local').fill('Sala 12');
    await items.nth(4).getByRole('checkbox', { name: 'Levar para a agenda' }).uncheck();
    // Erro de horário bloqueia a confirmação até corrigir.
    await items.nth(1).getByLabel('Fim').fill('13:00');
    await expect(items.nth(1)).toContainText('O fim precisa ser depois do início.');
    await expect(page.getByRole('button', { name: /Confirmar e levar/ })).toBeDisabled();
    await items.nth(1).getByLabel('Fim').fill('17:00');

    await page.getByRole('button', { name: 'Confirmar e levar para a agenda (4)' }).click();
    await expect(page.getByText('Pronto. 4 itens incluídos')).toBeVisible();

    const lessons = await db.select().from(s.lessons).where(eq(s.lessons.ownerId, user!.id));
    expect(lessons.map((l) => l.title).sort()).toEqual([
      'Choque séptico',
      'Inflamação aguda',
      'Laboratório de histopatologia',
    ]);
    expect(lessons.find((l) => l.title === 'Inflamação aguda')?.location).toBe('Sala 12');
    const assessments = await db
      .select()
      .from(s.assessments)
      .where(eq(s.assessments.ownerId, user!.id));
    expect(assessments.map((a) => a.name)).toEqual(['P1']);

    await page.getByRole('link', { name: 'Voltar para Minhas disciplinas' }).click();
    await expect(card).toContainText('Cronograma conferido e na agenda.');

    // As aulas confirmadas aparecem na rotina da semana delas, protegidas (ROT-02, ROT-05).
    await setFeatures(['disciplinas', 'rotina']);
    await page.goto('/app/rotina?semana=2026-08-10');
    await page
      .getByRole('button', { name: 'Inflamação aguda, aula do cronograma, segunda, 08:00' })
      .click();
    await expect(page.getByRole('dialog', { name: 'Inflamação aguda' })).toContainText(
      'Ela fica protegida na rotina',
    );
    await page.getByRole('button', { name: 'Fechar' }).click();
    // Semana de 09/08: aula de 2 h na segunda e prática de 3 h na quarta.
    await expect(page.getByRole('definition').filter({ hasText: '5h/sem' }).first()).toBeVisible();
  });
});
