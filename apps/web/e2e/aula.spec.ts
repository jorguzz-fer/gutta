import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { eq, schema as s, sql } from '@gutta/db';
import { completeOnboarding, ownerDb, setFeatures, signUp, uniqueEmail } from './helpers';
import { pagesPdf } from './pdf';

// Acompanhar Aula (SPEC v2, 5.7; ADR 0015; plano, item 55). Saída da Fase 3: o PDF original
// permanece intacto e as anotações sobrevivem à troca de versão.
const AULA = path.join(import.meta.dirname, '../../worker/test/fixtures/aula.pdf');
const V2 = pagesPdf([
  ['Objetivos da aula'],
  [
    'Inflamação aguda',
    'Resposta imediata do organismo a uma agressão. Vasodilatação e aumento da permeabilidade vascular.',
  ],
  ['Mediadores químicos', 'Histamina, prostaglandinas e citocinas participam da resposta.'],
]);

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

/** Risca o slide com o mouse, da esquerda para a direita, na altura pedida (0 a 1). */
async function stroke(page: Page, name: RegExp, y: number) {
  const slide = page.getByRole('img', { name });
  await slide.scrollIntoViewIfNeeded();
  const box = (await slide.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++)
    await page.mouse.move(box.x + box.width * (0.2 + i * 0.04), box.y + box.height * y + i);
  await page.mouse.up();
}

test.describe('acompanhar aula', () => {
  test.beforeAll(() => setFeatures(['materiais', 'aula', 'meu_espaco']));
  test.afterAll(() => setFeatures([]));

  test('slides, marcações, caderno, selos, concluir e versão nova @celular', async ({ page }) => {
    test.setTimeout(240_000);
    const email = uniqueEmail('aula');
    await signUp(page, 'Rui', email);
    await page.goto('/app');
    await completeOnboarding(page);
    const db = ownerDb();
    const user = await db.query.authUsers.findFirst({ where: eq(s.authUsers.email, email) });
    const disc = await db.query.enrolledDisciplines.findFirst({
      where: eq(s.enrolledDisciplines.ownerId, user!.id),
    });
    const [lesson] = await db
      .insert(s.lessons)
      .values({
        ownerId: user!.id,
        disciplineId: disc!.id,
        title: 'Inflamação aguda e crônica',
        startsAt: new Date(Date.now() - 2 * 3_600_000),
        endsAt: new Date(Date.now() - 3_600_000),
        origin: 'imported',
      })
      .returning();
    const layers = async () =>
      (
        await db.select().from(s.slideAnnotations).where(eq(s.slideAnnotations.ownerId, user!.id))
      ).map((a) => [a.page, (a.layer as unknown[]).length]);

    // Antes: a aula sem material pede os slides.
    await page.goto(`/app/aulas/${lesson!.id}`);
    await expect(page.getByRole('heading', { name: 'Inflamação aguda e crônica' })).toBeVisible();
    await expect(page.getByText('Depois da aula')).toBeVisible();
    await page.getByRole('button', { name: 'Anexar slides' }).click();
    const dialog = page.getByRole('dialog', { name: 'Anexar material' });
    await expect(dialog.getByText('Aula: Inflamação aguda e crônica')).toBeVisible();
    await dialog.getByLabel('Arquivo').setInputFiles(AULA);
    await dialog.getByLabel('Título').fill('Slides da aula');
    await dialog.getByRole('button', { name: 'Anexar' }).click();
    // Espera o envio terminar antes de recarregar.
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // O worker prepara o arquivo; depois o slide aparece pelo pdf.js.
    await expect
      .poll(
        async () => {
          await page.reload();
          return page.getByText('1 de 2', { exact: true }).count();
        },
        { timeout: 60_000 },
      )
      .toBe(1);
    await expect(page.getByText('Carregando o slide…')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByText('Não deu para mostrar esta página')).toHaveCount(0);

    // Caneta: o traço aparece na hora e é salvo sozinho.
    await stroke(page, /Slide 1 de 2/, 0.3);
    await expect.poll(layers, { timeout: 15_000 }).toEqual([[1, 1]]);
    // Borracha apaga; desfazer traz de volta.
    await page.getByRole('button', { name: 'Borracha' }).click();
    await stroke(page, /Slide 1 de 2/, 0.3);
    await expect.poll(layers, { timeout: 15_000 }).toEqual([[1, 0]]);
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await expect.poll(layers, { timeout: 15_000 }).toEqual([[1, 1]]);
    await expect(page.getByText('Salvo')).toBeVisible();
    // Continua no outro aparelho: depois de recarregar, o traço está lá.
    await page.reload();
    await expect(page.getByRole('img', { name: /Slide 1 de 2/ }).locator('path')).toHaveCount(1);
    // Outro aparelho gravou por cima enquanto esta tela estava aberta: vence a última gravação
    // e a versão substituída fica no histórico, de onde volta.
    await db
      .update(s.slideAnnotations)
      .set({ revision: sql`${s.slideAnnotations.revision} + 1` })
      .where(eq(s.slideAnnotations.ownerId, user!.id));
    await stroke(page, /Slide 1 de 2/, 0.6);
    await expect.poll(layers, { timeout: 15_000 }).toEqual([[1, 2]]);
    await page.getByRole('button', { name: 'Histórico das marcações deste slide' }).click();
    const hdialog = page.getByRole('dialog', { name: 'Histórico do slide 1' });
    await expect(hdialog.getByText(/Substituída por outro aparelho · 1 marcação/)).toBeVisible();
    await hdialog.getByRole('button', { name: 'Recuperar' }).click();
    await expect(hdialog).toBeHidden();
    await expect.poll(layers, { timeout: 15_000 }).toEqual([[1, 1]]);
    await expect(page.getByRole('img', { name: /Slide 1 de 2/ }).locator('path')).toHaveCount(1);

    // Caderno no slide 2, com lista, negrito e fórmula.
    await page.getByRole('button', { name: 'Próximo slide' }).click();
    await expect(page.getByText('2 de 2', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Nova nota' }).click();
    await page
      .getByLabel('Texto da nota')
      .fill('Macrófagos **predominam** na fase crônica.\n- histamina\n- citocinas\n\n$x^2$');
    await expect
      .poll(async () =>
        (
          await db.select().from(s.notebookEntries).where(eq(s.notebookEntries.ownerId, user!.id))
        ).map((n) => n.page),
      )
      .toEqual([2]);
    await page.getByRole('button', { name: 'Pronto' }).click();
    await expect(page.locator('strong', { hasText: 'predominam' })).toBeVisible();
    await expect(page.locator('.katex').first()).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'citocinas' })).toBeVisible();

    // Selos, dúvida e lista de revisão.
    await page.getByRole('tab', { name: 'Aula' }).click();
    await page.getByRole('radio', { name: 'Alta prioridade' }).check();
    await page.getByRole('radio', { name: 'Difícil', exact: true }).check();
    await expect(
      page.getByRole('button', { name: 'Slide 2 · Alta prioridade · Difícil' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Slide 2, marcado como importante' }),
    ).toBeVisible();
    await page.getByLabel('Tenho dúvida neste slide').check();
    await page.getByLabel('Qual é a dúvida? (opcional)').fill('Por que predominam macrófagos?');
    await page.getByRole('button', { name: 'Guardar a dúvida' }).click();
    await expect(
      page.getByRole('button', { name: 'Slide 2 · Alta prioridade · Difícil · Dúvida' }),
    ).toBeVisible();

    // Presença e concluir aula: rápido e opcional.
    await page.getByRole('button', { name: 'Fui à aula' }).click();
    await expect(page.getByRole('button', { name: 'Fui à aula' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('radio', { name: 'Moderada: alguns conceitos pedem revisão' }).check();
    await page.getByLabel('Quero uma revisão de 30 minutos').check();
    await page.getByRole('button', { name: 'Concluir aula' }).click();
    await expect(page.getByRole('heading', { name: 'Aula concluída' })).toBeVisible();
    await expect(page.getByText('Revisão de 30 minutos pedida.')).toBeVisible();
    await axe(page, 'aula');

    // O PDF do professor continua igual ao enviado.
    const version = await db.query.materialVersions.findFirst({
      where: eq(s.materialVersions.ownerId, user!.id),
    });
    const { url } = await (
      await page.request.get(`/api/v1/files/${version!.fileId}/url?variant=original`)
    ).json();
    const original = await (await page.request.get(url)).body();
    const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
    expect(sha(original)).toBe(sha(readFileSync(AULA)));

    // Progresso (6.4, D13): a única aula que já aconteceu foi concluída.
    await page.goto('/app');
    await expect(page.getByText('Progresso geral:')).toContainText('100%');
    await expect(page.getByText('1 de 1 aulas concluídas')).toBeVisible();

    // Meu caderno da disciplina, com busca sem acento.
    await page.goto(`/app/minhas-disciplinas/${disc!.id}/caderno`);
    await expect(page.getByRole('heading', { name: 'Caderno da disciplina' })).toBeVisible();
    await page.getByLabel('Buscar no caderno').fill('macrofagos');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page.locator('strong', { hasText: 'predominam' })).toBeVisible();
    await expect(page.getByText('Alta prioridade')).toBeVisible();
    await axe(page, 'caderno');

    // O professor trocou a apresentação: um slide novo no começo.
    await page.goto(`/app/materiais/${version!.materialId}`);
    await page.getByRole('button', { name: 'Enviar nova versão' }).click();
    const vdialog = page.getByRole('dialog', { name: 'Enviar nova versão' });
    await vdialog
      .getByLabel('Arquivo')
      .setInputFiles({ name: 'slides-v2.pdf', mimeType: 'application/pdf', buffer: V2 });
    await vdialog.getByRole('button', { name: 'Enviar versão' }).click();
    await expect(vdialog).toBeHidden({ timeout: 30_000 });
    await page.goto(`/app/aulas/${lesson!.id}`);
    await expect
      .poll(
        async () => {
          await page.reload();
          return page.getByText(/^\d de 3$/).count();
        },
        { timeout: 60_000 },
      )
      .toBe(1);
    await expect(page.getByText('Este material ganhou uma versão nova.')).toBeVisible();
    await page.getByRole('button', { name: 'Levar para a versão nova' }).click();
    const rdialog = page.getByRole('dialog', { name: 'Levar suas marcações para a versão nova' });
    await expect(rdialog.getByLabel(/Página 1/)).toHaveValue('2');
    await expect(rdialog.getByLabel(/Página 2/)).toHaveValue('3');
    await axe(page, 'reassociar');
    await rdialog.getByRole('button', { name: 'Levar para a versão nova' }).click();
    await expect(page.getByText('Este material ganhou uma versão nova.')).toBeHidden({
      timeout: 15_000,
    });
    await expect(
      page.getByRole('button', { name: 'Slide 3, marcado como importante' }),
    ).toBeVisible();
    await expect.poll(layers).toEqual([[2, 1]]);
  });

  test('desligado pela chave, a página da aula não existe', async ({ page }) => {
    await setFeatures(['materiais']);
    const email = uniqueEmail('aula-off');
    await signUp(page, 'Eva', email);
    await page.goto('/app');
    await completeOnboarding(page);
    const db = ownerDb();
    const user = await db.query.authUsers.findFirst({ where: eq(s.authUsers.email, email) });
    const disc = await db.query.enrolledDisciplines.findFirst({
      where: eq(s.enrolledDisciplines.ownerId, user!.id),
    });
    const [lesson] = await db
      .insert(s.lessons)
      .values({ ownerId: user!.id, disciplineId: disc!.id, title: 'Aula', startsAt: new Date() })
      .returning();
    const res = await page.goto(`/app/aulas/${lesson!.id}`);
    expect(res?.status()).toBe(404);
    await setFeatures(['materiais', 'aula', 'meu_espaco']);
  });
});
