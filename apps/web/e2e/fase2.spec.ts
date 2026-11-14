import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding, setFeatures, signUp, uniqueEmail } from './helpers';
import { textPdf } from './pdf';

// Fase 2 da v2 (plano, itens 50 e 51): do cronograma conferido à visão geral da disciplina,
// com a mesma prova na agenda, nas notas e na disciplina (sem duplicar), falta registrada e
// nota lançada. axe nos dois temas.
const TZ = 'America/Sao_Paulo';
const day = (offset: number) => {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

async function axe(page: Page, where: string) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const v = (
      await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
    ).violations.map((x) => `${where} (${colorScheme}): ${x.id}`);
    expect(v).toEqual([]);
  }
}

test.describe('fase 2', () => {
  test.beforeAll(() =>
    setFeatures(['disciplinas', 'agenda', 'meu_espaco', 'lembretes', 'faltas', 'notas']),
  );
  test.afterAll(() => setFeatures([]));

  test('cronograma até a visão geral, com falta, nota e agenda sem duplicar @celular', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const aula = day(1);
    const prova = day(5);
    const pdf = textPdf([
      'Cronograma de Patologia (teste)',
      `${br(aula)} 08:00-10:00 Aula: Inflamação aguda`,
      `${br(prova)} 19:00-21:00 Prova: P1`,
    ]);

    await signUp(page, 'Íris', uniqueEmail('fase2'));
    await page.goto('/app');
    await completeOnboarding(page);

    // Disciplina com cronograma, lido e conferido.
    await page.goto('/app/minhas-disciplinas');
    await page.getByLabel('Nome da disciplina').fill('Patologia');
    await page.getByLabel('Sigla').fill('Pato');
    await page.getByLabel('Cronograma').setInputFiles({
      name: 'cronograma.pdf',
      mimeType: 'application/pdf',
      buffer: pdf,
    });
    await page.getByRole('button', { name: 'Adicionar disciplina' }).click();
    const card = page.getByRole('listitem').filter({ hasText: 'Patologia' }).first();
    await card.getByRole('button', { name: 'Autorizar a leitura' }).click();
    await card.getByRole('link', { name: 'Conferir o cronograma' }).click({ timeout: 45_000 });
    await page.getByRole('button', { name: 'Confirmar e levar para a agenda (2)' }).click();
    await expect(page.getByText('Pronto. 2 itens incluídos')).toBeVisible();

    // Visão geral da disciplina.
    await page.goto('/app/minhas-disciplinas');
    await page.getByRole('link', { name: 'Patologia', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Pato', level: 1 })).toBeVisible();
    await expect(page.getByText('Inflamação aguda').first()).toBeVisible();
    const cal = page.getByRole('region', { name: 'Próximos eventos da disciplina' });
    await expect(cal.getByRole('row')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Baixar o cronograma' })).toBeVisible();
    await axe(page, 'visão geral');

    // A prova é a mesma linha na agenda (uma vez só) e nas notas.
    await page.goto(`/app/agenda?visao=lista&data=${day(0)}`);
    await expect(page.getByRole('button', { name: /^P1, 19:00/ })).toHaveCount(1);

    // Nota da P1 e configuração de faltas com a aula do cronograma.
    await page.goto('/app/notas');
    await page.getByRole('link', { name: 'Patologia' }).click();
    await expect(page.getByText('P1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Lançar ou editar nota de P1' }).click();
    await page.getByLabel('Nota de P1 (0 a 10,0)').fill('8,5');
    await page.getByRole('button', { name: 'Salvar nota' }).click();
    await expect(page.getByText('Média 8,5, acima da mínima de 7,0.')).toBeVisible();

    await page.goto('/app/faltas');
    await page.getByRole('link', { name: 'Patologia' }).click();
    await page.getByLabel('Carga horária (horas-aula)').fill('80');
    await page.getByRole('button', { name: 'Salvar configuração' }).click();
    await expect(page.getByText('Dentro do limite')).toBeVisible();
    if (aula.slice(0, 7) !== day(0).slice(0, 7)) {
      await page.getByRole('button', { name: 'Próximo mês' }).click();
    }
    await page.getByRole('button', { name: `${br(aula)}, dia de aula` }).click();
    await page.getByRole('button', { name: 'Registrar falta' }).click();
    await expect(
      page.getByRole('button', { name: `${br(aula)}, dia de aula, falta registrada` }),
    ).toBeVisible();

    // De volta à visão geral: os cartões refletem falta e nota.
    await page.goto('/app/minhas-disciplinas');
    await page.getByRole('link', { name: 'Patologia', exact: true }).click();
    await expect(page.getByText('2/20')).toBeVisible();
    await expect(page.getByText('8,5', { exact: true })).toBeVisible();
    await expect(page.getByText('Acima da mínima de 7,0')).toBeVisible();
  });
});
