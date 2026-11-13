import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { completeOnboarding, setFeatures, signUp, uniqueEmail } from './helpers';

const axe = async (page: import('@playwright/test').Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()).violations;

// Meu Espaço inicial e agenda geral (SPEC v2, ESP e CAL-14; plano, item 44).
test.describe('Meu Espaço e agenda', () => {
  test.beforeAll(() => setFeatures(['disciplinas', 'rotina', 'agenda', 'meu_espaco']));
  test.afterAll(() => setFeatures([]));

  test('estados vazios honestos, rotina refletida no painel e na agenda @celular', async ({
    page,
  }) => {
    const email = uniqueEmail('espaco');
    await signUp(page, 'Hugo', email);
    await page.goto('/app');
    await completeOnboarding(page);

    await expect(page.getByRole('heading', { name: 'Olá, Hugo!' })).toBeVisible();
    await expect(page.getByText('Estudante de Medicina · 2º semestre')).toBeVisible();
    await expect(page.getByText('Sua rotina ainda está vazia.')).toBeVisible();
    await expect(page.getByText('Nada marcado para hoje.')).toBeVisible();
    await expect(
      page.getByText('Nenhuma prova, entrega ou prática nos próximos 14 dias.'),
    ).toBeVisible();
    // A disciplina do onboarding do MVP vira disciplina própria, sem cronograma.
    await expect(page.getByText('Sem aulas no cronograma ainda')).toBeVisible();
    expect(await axe(page)).toEqual([]);

    // Objetivo.
    await page.getByRole('link', { name: 'Alterar objetivo' }).click();
    await page.getByRole('radio', { name: 'Organizar minha rotina' }).check();
    await page.getByRole('button', { name: 'Salvar objetivo' }).click();
    await expect(page.getByText('Objetivo atualizado.')).toBeVisible();
    await expect(page.getByText('Organizar minha rotina')).toBeVisible();

    // Rotina: estudo todos os dias às 07:00; aparece hoje no painel e na agenda.
    await page.getByRole('link', { name: 'Ver e editar rotina' }).click();
    await page.getByLabel('Mostrar de').selectOption({ label: '06:00' });
    await page.getByRole('button', { name: /^Adicionar em segunda, 07:00$/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Adicionar atividade' });
    for (const d of ['domingo', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'])
      await dialog.getByRole('checkbox', { name: d }).check();
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Sua rotina soma 7 horas de estudo.')).toBeVisible();

    await page.goto('/app');
    await expect(page.getByText('7h planejadas')).toBeVisible();
    await expect(
      page.getByRole('region', { name: /Visão do dia/ }).getByText('Estudo', { exact: true }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Agenda', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible();
    await expect(page.getByText('07:00 – 08:00')).toHaveCount(7);
    expect(await axe(page)).toEqual([]);
    // Filtro: sem estudo, a semana fica vazia.
    await page.getByRole('checkbox', { name: 'Estudo' }).uncheck();
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page.getByText('07:00 – 08:00')).toHaveCount(0);
    await expect(page.getByText('Nada marcado.')).toHaveCount(7);
  });
});
