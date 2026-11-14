import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fakeCpf, setFeatures, signUp, uniqueEmail } from './helpers';
import { textPdf } from './pdf';

// Fluxo completo da fase 1 da v2 (plano, item 45): conta nova, cadastro, cronograma conferido,
// rotina e Meu Espaço com a semana real. axe em cada tela, nos dois temas.
const TZ = 'America/Sao_Paulo';
const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function localDay(offset: number) {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return {
    br: `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`,
    weekday: d.getUTCDay(),
  };
}

async function axe(page: Page, where: string) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const violations = (
      await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
    ).violations.map((v) => `${where} (${colorScheme}): ${v.id}`);
    expect(violations).toEqual([]);
  }
}

test.describe('fluxo da v2', () => {
  test.beforeAll(() => setFeatures(['cadastro', 'disciplinas', 'rotina', 'agenda', 'meu_espaco']));
  test.afterAll(() => setFeatures([]));

  test('conta nova até o Meu Espaço com a semana real @celular', async ({ page }) => {
    test.setTimeout(120_000);
    const today = localDay(0);
    const cronograma = textPdf([
      'Cronograma de Fisiopatologia (teste)',
      `${today.br} 22:00-23:00 Aula: Inflamação aguda`,
      `${localDay(1).br} 14:00-17:00 Prática: Laboratório de histopatologia`,
      `${localDay(3).br} 19:00-21:00 Prova: P1`,
      `${localDay(5).br} Entrega: Relatório de caso clínico`,
    ]);

    // Conta e cadastro.
    await signUp(page, 'Lia', uniqueEmail('fluxo-v2'));
    await page.goto('/app');
    await expect(page).toHaveURL(/\/comecar\/dados/);
    await page.getByLabel('Nome completo').fill('Lia Moreira');
    await page.getByLabel('CPF').fill(fakeCpf());
    await page.getByLabel('Telefone com DDD').fill('(21) 99876-5432');
    await page.getByRole('button', { name: 'Salvar e continuar' }).click();
    await page.getByLabel('Curso de graduação').selectOption({ label: 'Medicina' });
    await page.getByLabel('Semestre').selectOption('3');
    await page.getByLabel('Instituição').selectOption({ index: 1 });
    await page.getByRole('radio', { name: 'Preparar-me para provas' }).check();
    await page.getByRole('button', { name: 'Salvar e continuar' }).click();

    // Disciplina com cronograma: autoriza a leitura e confere ainda no cadastro.
    await expect(page).toHaveURL(/\/comecar\/disciplinas/);
    await page.getByLabel('Nome da disciplina').fill('Fisiopatologia');
    await page.getByLabel('Sigla').fill('Fisiopato');
    await page.getByLabel('Cronograma').setInputFiles({
      name: 'cronograma.pdf',
      mimeType: 'application/pdf',
      buffer: cronograma,
    });
    await page.getByRole('button', { name: 'Adicionar disciplina' }).click();
    const card = page.getByRole('listitem').filter({ hasText: 'Fisiopatologia' }).first();
    await card.getByRole('button', { name: 'Autorizar a leitura' }).click();
    await card.getByRole('link', { name: 'Conferir o cronograma' }).click({ timeout: 45_000 });
    await expect(page).toHaveURL(/\/comecar\/cronograma\//);
    const items = page.getByRole('list', { name: 'Itens do cronograma' }).getByRole('listitem');
    await expect(items).toHaveCount(4);
    await axe(page, 'conferência');
    await page.getByRole('button', { name: 'Confirmar e levar para a agenda (4)' }).click();
    await expect(page.getByText('Pronto. 4 itens incluídos')).toBeVisible();
    await page.getByRole('link', { name: 'Voltar para as disciplinas' }).click();
    await expect(card).toContainText('Cronograma conferido e na agenda.');
    await page.getByRole('button', { name: 'Continuar' }).click();

    // Rotina: as aulas do cronograma já estão na grade; marca estudo hoje às 08:00.
    await expect(page).toHaveURL(/\/comecar\/rotina/);
    const day = DAY_NAMES[today.weekday];
    await expect(
      page.getByRole('button', { name: `Inflamação aguda, aula do cronograma, ${day}, 22:00` }),
    ).toBeVisible();
    await page.getByRole('button', { name: `Adicionar em ${day}, 08:00` }).click();
    const dialog = page.getByRole('dialog', { name: 'Adicionar atividade' });
    await dialog.getByRole('radio', { name: 'Estudo' }).check();
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Sua rotina soma 1 hora de estudo.')).toBeVisible();
    await axe(page, 'rotina');
    await page.getByRole('button', { name: 'Concluir cadastro' }).click();
    await page.waitForURL((u) => u.pathname === '/app');

    // Meu Espaço com a semana real.
    await expect(page.getByRole('heading', { name: 'Olá, Lia!' })).toBeVisible();
    await expect(page.getByText('Preparar-me para provas')).toBeVisible();
    const hoje = page.getByRole('region', { name: /Visão do dia/ });
    await expect(hoje.getByText('Inflamação aguda')).toBeVisible();
    await expect(hoje.getByText('Estudo', { exact: true })).toBeVisible();
    await expect(page.getByText('Cronograma conferido')).toBeVisible();
    const proximos = page.getByRole('region', { name: /Próximos compromissos/ });
    await expect(proximos.getByText('Laboratório de histopatologia')).toBeVisible();
    await expect(proximos.getByText('P1')).toBeVisible();
    await expect(proximos.getByText('Relatório de caso clínico')).toBeVisible();
    await expect(page.getByText('1h planejadas')).toBeVisible();
    await axe(page, 'Meu Espaço');

    // Agenda geral: a mesma aula, sem cópia.
    await page.getByRole('link', { name: 'Agenda', exact: true }).click();
    await expect(page.getByText('Inflamação aguda')).toHaveCount(1);
    await axe(page, 'agenda');
  });
});
