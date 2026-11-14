import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addDays, localDayKey, weekStart, zonedTimeToUtc } from '@gutta/core';
import { eq, schema as s } from '@gutta/db';
import { completeOnboarding, ownerDb, setFeatures, signUp, uniqueEmail } from './helpers';

// Equilíbrio (SPEC v2, 5.4; plano, item 59). Critérios do documento: proposta só nos horários
// autorizados, aceitar em parte, editar e recusar, os três indicadores separados e o motivo de
// cada sessão.
const TZ = 'America/Sao_Paulo';
const NEXT = weekStart(addDays(localDayKey(new Date(), TZ), 7));

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

test.describe('equilíbrio', () => {
  test.beforeAll(() => setFeatures(['rotina', 'agenda', 'meu_espaco', 'equilibrio']));
  test.afterAll(() => setFeatures([]));

  test('pedido da prova, proposta, aceitar em parte, agenda, registro e Meu Espaço @celular', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail('equilibrio');
    await signUp(page, 'Bia', email);
    await page.goto('/app');
    await completeOnboarding(page);
    const db = ownerDb();
    const user = await db.query.authUsers.findFirst({ where: eq(s.authUsers.email, email) });
    const disc = await db.query.enrolledDisciplines.findFirst({
      where: eq(s.enrolledDisciplines.ownerId, user!.id),
    });
    // Horário de estudo autorizado na rotina: todo dia, das 19h às 21h.
    await db.insert(s.routineBlocks).values({
      ownerId: user!.id,
      kind: 'estudo',
      label: 'Estudo',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startMinute: 19 * 60,
      durationMinutes: 120,
    });
    const provaDay = addDays(NEXT, 4);
    await db.insert(s.assessments).values({
      ownerId: user!.id,
      disciplineId: disc!.id,
      name: 'P1',
      kind: 'prova',
      dueAt: zonedTimeToUtc(provaDay, TZ, 8),
    });

    // Na agenda, a prova oferece o plano de revisão (CAL-10).
    await page.goto(`/app/agenda?visao=semana&data=${provaDay}`);
    await page.getByRole('button', { name: /^P1, / }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Pedir plano de revisão' }).click();
    await expect(dialog.getByText('Pedido enviado ao Equilíbrio.')).toBeVisible();

    // Proposta da semana que vem: só nos horários autorizados, com o motivo.
    await page.goto(`/app/equilibrio?semana=${NEXT}`);
    await expect(page.getByRole('heading', { name: 'Equilíbrio', level: 1 })).toBeVisible();
    await expect(page.getByText('1 tarefa pendente.')).toBeVisible();
    await axe(page, 'equilibrio');
    await page.getByRole('button', { name: 'Gerar proposta de estudos' }).click();
    const proposal = page.getByRole('region', { name: 'Proposta da semana' });
    await expect(proposal).toBeVisible();
    const keep = proposal.getByRole('checkbox');
    await expect(keep).toHaveCount(4);
    await expect(proposal.getByText(/Por quê: P1 de .+ n[ao] quinta/).first()).toBeVisible();
    for (const t of await proposal.getByText(/^\d\d:\d\d às \d\d:\d\d/).allTextContents())
      expect(t >= '19:00' && t.slice(8, 13) <= '21:00').toBe(true);
    await axe(page, 'proposta');
    // Aceita em parte: desmarca uma.
    await keep.last().uncheck();
    await proposal.getByRole('button', { name: 'Aceitar as marcadas' }).click();
    await expect(proposal).toBeHidden();
    const sessions = page.getByRole('region', { name: 'Sessões da semana' });
    await expect(sessions.getByRole('button', { name: 'Fiz', exact: true })).toHaveCount(3);
    const indicators = page.getByRole('list', { name: 'Indicadores da semana' });
    await expect(indicators.getByText('1 h 30 min', { exact: true })).toBeVisible();
    await expect(indicators.getByText('14 h', { exact: true })).toBeVisible();

    // Na agenda, só as confirmadas.
    await page.goto(`/app/agenda?visao=semana&data=${NEXT}`);
    await expect(page.getByRole('button', { name: /^Revisão para P1, / })).toHaveCount(3);

    // Registro opcional, de um toque.
    await page.goto(`/app/equilibrio?semana=${NEXT}`);
    await sessions.getByRole('button', { name: 'Fiz', exact: true }).first().click();
    await expect(sessions.getByText('Feita', { exact: true })).toBeVisible();
    await expect(indicators.getByText('30 min', { exact: true })).toBeVisible();

    // Preferências (EQU-01): muda e salva.
    await page.getByRole('link', { name: 'Preferências e limites' }).click();
    await expect(page.getByText('não recomendações de saúde')).toBeVisible();
    await page.getByRole('radio', { name: /^Leve/ }).check();
    await page.getByRole('button', { name: 'Salvar preferências' }).click();
    await expect(page.getByText('Preferências salvas.')).toBeVisible();
    await axe(page, 'preferencias');

    // Meu Espaço mostra o estado da semana (EQU-16).
    await page.goto('/app');
    await expect(page.getByText('Minha semana está equilibrada?')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Equilíbrio', exact: true })).toBeVisible();
  });

  test('desligado pela chave, a página não existe', async ({ page }) => {
    await setFeatures(['rotina']);
    await signUp(page, 'Edu', uniqueEmail('equilibrio-off'));
    await page.goto('/app');
    await completeOnboarding(page);
    const res = await page.goto('/app/equilibrio');
    expect(res?.status()).toBe(404);
    await setFeatures(['rotina', 'agenda', 'meu_espaco', 'equilibrio']);
  });
});
