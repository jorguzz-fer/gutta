import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding, setFeatures, signUp, uniqueEmail, waitMail } from './helpers';

// Lembretes e avisos (SPEC v2, 5.11; plano, item 47).
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()).violations;
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

test.describe('lembretes e avisos', () => {
  test.beforeAll(() => setFeatures(['lembretes', 'agenda', 'meu_espaco', 'disciplinas']));
  test.afterAll(() => setFeatures([]));

  test('lembrete vira aviso na plataforma e por e-mail; tarefa de hoje no Meu Espaço @celular', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail('lembretes');
    await signUp(page, 'Rui', email);
    await page.goto('/app');
    await completeOnboarding(page);

    // Liga o e-mail antes de criar o lembrete.
    await page.goto('/app/avisos');
    await expect(page.getByText('Nenhum aviso por enquanto.')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Receber também por e-mail' }).check();
    await page.getByRole('button', { name: 'Salvar preferências' }).click();
    await expect(page.getByText('Preferências salvas.')).toBeVisible();
    expect(await axe(page)).toEqual([]);

    // Lembrete de hoje às 00:00, aviso na hora: já chegou.
    await page.goto('/app/lembretes');
    await page.getByRole('button', { name: 'Novo lembrete' }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo lembrete' });
    await dialog.getByLabel('Título').fill('Ler o capítulo 3');
    await dialog.getByLabel('Data').fill(today());
    await dialog.getByLabel('Hora').fill('00:00');
    await dialog.getByLabel('Quando lembrar').selectOption('0');
    expect(await axe(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('button', { name: /Ler o capítulo 3/ })).toBeVisible();

    // Reservar horário amanhã: vira compromisso na agenda.
    await page.getByRole('button', { name: 'Novo lembrete' }).click();
    await dialog.getByLabel('Título').fill('Reunião do grupo');
    const tomorrow = new Date(`${today()}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await dialog.getByLabel('Data').fill(tomorrow.toISOString().slice(0, 10));
    await dialog.getByLabel('Hora').fill('15:00');
    await dialog.getByRole('radio', { name: 'Reservar horário' }).check();
    await dialog.getByLabel('Duração em minutos').fill('90');
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Horário reservado')).toBeVisible();

    // Avisos: contador no cabeçalho, lista e e-mail enviado pelo worker.
    await page.goto('/app/avisos');
    await expect(page.getByRole('link', { name: 'Avisos, 1 não lido' })).toBeVisible();
    await expect(page.getByText('1 aviso novo')).toBeVisible();
    const mail = await waitMail(email, 'Ler o capítulo 3');
    expect(mail.text).toContain('/app/lembretes');
    await page.getByRole('button', { name: 'Marcar tudo como lido' }).click();
    await expect(page.getByText('Tudo lido')).toBeVisible();

    // Meu Espaço: tarefa de hoje com marcação e contador.
    await page.goto('/app');
    await expect(page.getByText('Tarefas de hoje')).toBeVisible();
    await expect(page.getByText('(0/1)')).toBeVisible();
    await page.getByRole('checkbox', { name: /Ler o capítulo 3/ }).check();
    await expect(page.getByText('(1/1)')).toBeVisible();

    // Agenda de amanhã: o compromisso reservado, uma vez só.
    await page.goto(`/app/agenda?visao=dia&data=${tomorrow.toISOString().slice(0, 10)}`);
    await expect(
      page.getByRole('button', { name: /^Reunião do grupo, 15:00 – 16:30/ }),
    ).toHaveCount(1);
  });
});
