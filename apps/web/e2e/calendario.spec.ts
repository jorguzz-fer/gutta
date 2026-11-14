import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding, setFeatures, signUp, uniqueEmail } from './helpers';

// Calendário (SPEC v2, CAL-01 a CAL-08; plano, item 46).
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()).violations;

test.describe('calendário', () => {
  test.beforeAll(() => setFeatures(['disciplinas', 'agenda']));
  test.afterAll(() => setFeatures([]));

  test('série semanal, só esta, esta e as próximas, prova e calendário da disciplina @celular', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signUp(page, 'Caio', uniqueEmail('calendario'));
    await page.goto('/app');
    await completeOnboarding(page);

    // Agosto de 2026: terças 4, 11, 18 e 25.
    await page.goto('/app/agenda?visao=lista&data=2026-08-01');
    await page.getByRole('button', { name: 'Novo evento', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo evento' });
    await dialog.getByLabel('Título').fill('Monitoria');
    await dialog.getByLabel('Data').fill('2026-08-04');
    await dialog.getByLabel('Início').fill('10:00');
    await dialog.getByLabel('Fim').fill('11:00');
    await dialog.getByRole('combobox', { name: 'Repetição' }).selectOption('weekly');
    await dialog.getByLabel('Até').fill('2026-08-25');
    await expect(dialog.getByRole('checkbox', { name: 'terça' })).toBeChecked();
    expect(await axe(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('button', { name: /^Monitoria, 10:00 – 11:00/ })).toHaveCount(4);

    // Só esta: a do dia 11 passa para as 14:00.
    await page
      .getByRole('region', { name: /11 de agosto/ })
      .getByRole('button', { name: /^Monitoria/ })
      .click();
    const edit = page.getByRole('dialog', { name: 'Editar evento' });
    await expect(edit.getByLabel('Início')).toHaveValue('10:00');
    await edit.getByLabel('Início').fill('14:00');
    await edit.getByLabel('Fim').fill('15:00');
    await edit.getByRole('radio', { name: 'Só esta' }).check();
    await edit.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('button', { name: /^Monitoria, 14:00 – 15:00/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Monitoria, 10:00 – 11:00/ })).toHaveCount(3);

    // Excluir esta e as próximas a partir do dia 18.
    await page
      .getByRole('region', { name: /18 de agosto/ })
      .getByRole('button', { name: /^Monitoria/ })
      .click();
    await edit.getByRole('radio', { name: 'Esta e as próximas' }).check();
    await edit.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByRole('button', { name: /^Monitoria/ })).toHaveCount(2);

    // Prova da disciplina: aparece no mês e no calendário da disciplina, uma vez só.
    await page.getByRole('button', { name: 'Novo evento', exact: true }).click();
    await dialog.getByLabel('Tipo').selectOption('prova');
    await dialog.getByLabel('Título').fill('P1 de cardio');
    await dialog.getByLabel('Disciplina').selectOption({ index: 1 });
    await dialog.getByLabel('Data').fill('2026-08-20');
    await dialog.getByLabel('Início').fill('19:00');
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('button', { name: /^P1 de cardio, 19:00/ })).toBeVisible();

    await page.getByRole('link', { name: 'Mês', exact: true }).click();
    await expect(page.getByRole('heading', { name: /agosto de 2026/i })).toBeVisible();
    await expect(page.getByRole('button', { name: '19:00 P1 de cardio' })).toBeVisible();
    expect(await axe(page)).toEqual([]);

    await page.getByRole('link', { name: 'Fisiologia cardiovascular' }).click();
    await expect(
      page.getByRole('heading', { name: 'Calendário de Fisiologia cardiovascular' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '19:00 P1 de cardio' })).toBeVisible();
    // Sem a rotina, a monitoria (sem disciplina) não aparece; com a chave, aparece.
    await expect(page.getByRole('button', { name: /Monitoria/ })).toHaveCount(0);
    await page.getByRole('switch', { name: 'Mostrar minha rotina' }).click();
    await expect(page.getByRole('button', { name: /Monitoria/ })).toHaveCount(2);
  });
});
