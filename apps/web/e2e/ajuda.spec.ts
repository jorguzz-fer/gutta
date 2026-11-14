import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { completeOnboarding, setFeatures, signUp, uniqueEmail } from './helpers';

// Ajuda Cognuss (SPEC v2, 5.14; ADR 0020; plano, itens 61 e 62). O worker do E2E usa o
// provedor de teste (sem rede): o caminho inteiro roda, da fila à criação com as páginas.
const AULA = path.join(import.meta.dirname, '../../worker/test/fixtures/aula.pdf');

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

test.describe('ajuda cognuss', () => {
  test.beforeAll(() => setFeatures(['materiais', 'ajuda', 'meu_espaco']));
  test.afterAll(() => setFeatures([]));

  test('criar resumo e questões a partir do material, com páginas e selo @celular', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await signUp(page, 'Gil', uniqueEmail('ajuda'));
    await page.goto('/app');
    await completeOnboarding(page);

    // Material com texto lido pelo worker.
    await page.goto('/app/materiais');
    await page.getByRole('button', { name: 'Anexar material' }).click();
    const dialog = page.getByRole('dialog', { name: 'Anexar material' });
    await dialog.getByLabel('Arquivo').setInputFiles(AULA);
    await dialog.getByLabel('Título').fill('Slides de inflamação');
    await dialog.getByLabel('Disciplina').selectOption({ index: 1 });
    await dialog.getByRole('button', { name: 'Anexar' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    const link = page.getByRole('link', { name: 'Slides de inflamação' });
    await expect(link).toBeVisible();
    await page.goto((await link.getAttribute('href'))!);
    await expect(page.getByRole('heading', { name: 'Slides de inflamação' })).toBeVisible();
    const create = page.getByRole('link', { name: 'Criar com IA a partir deste material' });
    await expect
      .poll(
        async () => {
          await page.reload();
          return create.count();
        },
        { timeout: 45_000 },
      )
      .toBe(1);
    await create.click();

    // Criar com IA: o material já vem marcado; autorização pedida uma vez.
    await expect(page.getByRole('heading', { name: 'Criar com IA' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Slides de inflamação/ })).toBeChecked();
    await axe(page, 'criar');
    await page.getByRole('button', { name: 'Preparar com IA' }).click();
    await expect(page.getByText('Para continuar, autorize a leitura pela IA.')).toBeVisible();
    await page.getByRole('checkbox', { name: /Autorizo a leitura/ }).check();
    await page.getByRole('button', { name: 'Preparar com IA' }).click();

    // Resumo pronto, com o selo e as páginas de origem.
    await expect(page.getByText('Gerado por IA a partir dos seus materiais').first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByRole('heading', { name: 'Pontos principais' })).toBeVisible();
    const fontes = page.getByRole('region', { name: 'Fontes usadas' });
    await expect(
      fontes.getByRole('link', { name: 'Slides de inflamação, página 1' }),
    ).toBeVisible();
    await axe(page, 'resumo');

    // Renomear e editar (IA-6).
    await page.getByRole('button', { name: 'Renomear' }).click();
    await page.getByLabel('Nome').fill('Meu resumo de inflamação');
    await page.getByRole('button', { name: 'Salvar nome' }).click();
    await expect(page.getByRole('heading', { name: 'Meu resumo de inflamação' })).toBeVisible();

    // Questões: o gabarito só aparece depois de responder.
    await page.goto('/app/ajuda/criar');
    await page.getByRole('checkbox', { name: /Slides de inflamação/ }).check();
    await page.getByRole('radiogroup', { name: 'Tipo' }).getByText('Questões').click();
    await expect(page.getByRole('radio', { name: 'Questões' })).toBeChecked();
    await page.getByLabel('Quantidade').selectOption('5');
    await page.getByRole('button', { name: 'Preparar com IA' }).click();
    const first = page.getByRole('article').first();
    await expect(first).toBeVisible({ timeout: 45_000 });
    await expect(first.getByText('(resposta)')).toHaveCount(0);
    await first.getByRole('radio').nth(1).check();
    await first.getByRole('button', { name: 'Responder' }).click();
    await expect(first.getByText('Não foi desta vez.')).toBeVisible();
    await expect(first.getByText('(resposta)')).toBeVisible();
    await axe(page, 'questoes');

    // Minhas criações lista as duas.
    await page.goto('/app/ajuda/criacoes');
    await expect(page.getByRole('link', { name: 'Meu resumo de inflamação' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Questões:/ })).toBeVisible();
    await page.goto('/app/ajuda');
    await expect(page.getByRole('heading', { name: 'Ajuda Cognuss' })).toBeVisible();
    await axe(page, 'central');

    // Tutor sobre os materiais (AJU-08): a resposta cita a página e leva ao material.
    await page.getByRole('link', { name: 'Tutor' }).click();
    await expect(page.getByRole('heading', { name: 'Tutor', exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: /Slides de inflamação/ }).check();
    await page.getByRole('button', { name: 'Abrir conversa' }).click();
    await expect(page.getByRole('heading', { name: 'Slides de inflamação' })).toBeVisible();
    await page.getByLabel('Sua pergunta').fill('O que acontece na inflamação aguda?');
    await page.getByRole('button', { name: 'Perguntar' }).click();
    const answer = page.getByRole('article', { name: 'Resposta do tutor' });
    await expect(answer.getByText('Gerado por IA a partir dos seus materiais')).toBeVisible();
    await expect(
      answer.getByRole('link', { name: '[P1] Slides de inflamação, página 1' }),
    ).toBeVisible();
    await axe(page, 'tutor');
    await page.goto('/app/ajuda/tutor');
    await expect(page.getByRole('link', { name: 'Slides de inflamação' })).toBeVisible();
  });

  test('desligado pela chave, a página não existe', async ({ page }) => {
    await setFeatures(['materiais']);
    await signUp(page, 'Ian', uniqueEmail('ajuda-off'));
    await page.goto('/app');
    await completeOnboarding(page);
    const res = await page.goto('/app/ajuda');
    expect(res?.status()).toBe(404);
    await setFeatures(['materiais', 'ajuda', 'meu_espaco']);
  });
});
