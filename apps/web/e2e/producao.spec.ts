import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { eq, schema as s } from '@gutta/db';
import {
  becomeAdmin,
  completeOnboarding,
  ownerDb,
  promote,
  setFeatures,
  signUp,
  uniqueEmail,
} from './helpers';

// Produção de aulas, Fase 1 (docs/producao/ESPECIFICACAO.md; ADR 0021): o admin envia a aula,
// o worker separa os slides e acha os pedidos, a IA (falsa no E2E) planeja, e o admin decide.
const AULA = path.join(import.meta.dirname, '../../worker/test/fixtures/aula-producao.pptx');

const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()).violations;

test.describe('produção de aulas', () => {
  // O envio de arquivos depende de um módulo com arquivos ligado.
  test.beforeAll(() => setFeatures(['materiais']));
  test.afterAll(() => setFeatures([]));

  test('envia a aula, vê os pedidos ao lado dos slides e aprova, edita e descarta', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const title = `Aula de teste · ${Date.now().toString(36)}`;
    await becomeAdmin(page, 'Paula Produção');
    await page.goto('/admin/producao');
    await expect(page.getByRole('heading', { name: 'Produção de aulas', level: 1 })).toBeVisible();
    expect(await axe(page)).toEqual([]);

    await page.getByLabel('Nome da aula').fill(title);
    await page.getByLabel('Arquivo da aula').setInputFiles(AULA);
    await page.getByRole('button', { name: 'Enviar e criar o lote' }).click();
    await expect(page).toHaveURL(/\/admin\/producao\/[0-9a-f-]{36}$/, { timeout: 30_000 });

    // A tela se atualiza sozinha enquanto o worker trabalha.
    await expect(page.getByText('Plano pronto')).toBeVisible({ timeout: 90_000 });
    await expect(
      page.getByText('7 slides, 3 com pedidos do professor, que formam 2 tarefas.'),
    ).toBeVisible();
    const tasks = page.getByRole('list', { name: 'Tarefas do lote' }).getByRole('article');
    await expect(tasks).toHaveCount(2);
    await expect(tasks.nth(0).getByText('01 · Pedido no slide 3')).toBeVisible();
    await expect(tasks.nth(1).getByText('02 · Pedido nos slides 6–7')).toBeVisible();
    await expect(tasks.nth(1).getByText('Prioridade do professor')).toBeVisible();
    // Slides de conteúdo do pedido, lado a lado com a tarefa.
    await expect(tasks.nth(1).getByRole('img', { name: 'Slide 4' })).toBeVisible();
    await expect(tasks.nth(1).getByRole('img', { name: 'Slide 5' })).toBeVisible();
    await tasks.nth(0).getByText('Pedido do professor').click();
    await expect(
      tasks
        .nth(0)
        .getByRole('paragraph')
        .filter({ hasText: /MONTAR UM ESQUEMA PARA SINALIZAÇÃO PARÁCRINA/ }),
    ).toBeVisible();
    expect(await axe(page)).toEqual([]);

    const credits = page.getByRole('region', { name: 'Decisão do plano' });
    await expect(credits.getByText('0 créditos', { exact: true })).toBeVisible();

    // Aprovar a primeira.
    await tasks.nth(0).getByRole('button', { name: 'Aprovar' }).click();
    await expect(tasks.nth(0).getByText('Aprovada', { exact: true })).toBeVisible();

    // Editar a segunda: vira vídeo, e o custo estimado sobe.
    await tasks.nth(1).getByRole('button', { name: 'Editar' }).click();
    await tasks.nth(1).getByLabel('Título').fill('O termostato hormonal');
    await tasks.nth(1).getByLabel('Tipo de peça').selectOption({ label: 'Vídeo com narração' });
    await tasks.nth(1).getByRole('button', { name: 'Salvar' }).click();
    await expect(
      tasks.nth(1).getByRole('heading', { name: 'O termostato hormonal' }),
    ).toBeVisible();
    await expect(credits.getByText('100 créditos', { exact: true })).toBeVisible();

    // Descartar a segunda: o custo volta.
    await tasks.nth(1).getByRole('button', { name: 'Descartar' }).click();
    await expect(tasks.nth(1).getByText('Descartada', { exact: true })).toBeVisible();
    await expect(credits.getByText('0 créditos', { exact: true })).toBeVisible();

    // A decisão fica salva.
    await page.reload();
    await expect(tasks.nth(0).getByText('Aprovada', { exact: true })).toBeVisible();
    await expect(tasks.nth(1).getByText('Descartada', { exact: true })).toBeVisible();

    // O slide oculto com o pedido aparece na lista completa, sem imagem.
    await page.getByText('Todos os slides (7)').click();
    await expect(page.getByText('Slide oculto').first()).toBeVisible();

    // Fase 2: liberar a geração. Só a aprovada vai (a descartada fica de fora).
    await page.getByRole('button', { name: 'Liberar geração' }).click();
    await expect(page.getByText('1 peça foi para a geração.')).toBeVisible();
    await expect(tasks.nth(0).getByText('Peça pronta', { exact: true })).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText('Peças geradas', { exact: true })).toBeVisible();

    // Tela da peça: prévia isolada nos dois temas, versão que passou e as capturas do teste.
    await tasks.nth(0).getByRole('link', { name: 'Abrir a peça' }).click();
    await expect(page.getByRole('heading', { name: 'Prévia da versão 1' })).toBeVisible();
    await expect(page.getByText('Passou no linter e no teste nos dois temas.')).toBeVisible();
    for (const tema of ['claro', 'escuro']) {
      const frame = page.frameLocator(`iframe[title="Peça no tema ${tema}"]`);
      await expect(frame.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(frame.getByText('Demonstração · sem revisão')).toBeVisible();
      await expect(frame.getByText('Na prova')).toBeVisible();
    }
    const versoes = page.getByRole('region', { name: 'Versões' });
    await expect(versoes.getByText('Passou', { exact: true })).toBeVisible();
    await expect(versoes.getByRole('img', { name: /Captura do teste, versão 1/ })).toHaveCount(3);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
          .exclude('iframe')
          .analyze()
      ).violations,
    ).toEqual([]);

    // Gerar de novo com pedido de ajuste: vira a versão 2.
    await page.getByLabel('Pedido de ajuste').fill('Aumentar o contraste das setas.');
    await page.getByRole('button', { name: 'Gerar de novo' }).click();
    await expect(page.getByRole('heading', { name: 'Prévia da versão 2' })).toBeVisible({
      timeout: 90_000,
    });
    await expect(versoes.getByRole('link', { name: 'Versão 1', exact: true })).toBeVisible();

    await page.goto('/admin/producao');
    await expect(page.getByRole('link', { name: title })).toBeVisible();
  });

  test('vídeo: roteiro, imagens aprovadas antes de animar, montagem e prévia com o vídeo', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const title = `Aula de vídeo · ${Date.now().toString(36)}`;
    await becomeAdmin(page, 'Vitor Vídeo');

    // Vozes e cota: a disciplina ganha uma voz própria.
    await page.goto('/admin/producao/vozes');
    await expect(
      page.getByRole('heading', { name: 'Vozes e cota de mídia', level: 1 }),
    ).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await page.getByLabel('Créditos de mídia por dia').fill('500');
    await page.getByRole('textbox').first().fill('vozDeTeste123');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('status')).toHaveText('Salvo.');

    await page.goto('/admin/producao');
    await page.getByLabel('Nome da aula').fill(title);
    await page.getByLabel('Arquivo da aula').setInputFiles(AULA);
    await page.getByRole('button', { name: 'Enviar e criar o lote' }).click();
    await expect(page).toHaveURL(/\/admin\/producao\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByText('Plano pronto')).toBeVisible({ timeout: 90_000 });
    const tasks = page.getByRole('list', { name: 'Tarefas do lote' }).getByRole('article');
    await tasks.nth(0).getByRole('button', { name: 'Descartar' }).click();
    await expect(tasks.nth(0).getByText('Descartada', { exact: true })).toBeVisible();
    await tasks.nth(1).getByRole('button', { name: 'Editar' }).click();
    await tasks.nth(1).getByLabel('Título').fill('Insulina: do pâncreas ao receptor');
    await tasks.nth(1).getByLabel('Tipo de peça').selectOption({ label: 'Vídeo com narração' });
    await tasks.nth(1).getByRole('button', { name: 'Salvar' }).click();
    await tasks.nth(1).getByRole('button', { name: 'Aprovar' }).click();
    await expect(tasks.nth(1).getByText('O vídeo começa pelo roteiro')).toBeVisible();
    await page.getByRole('button', { name: 'Liberar geração' }).click();
    await expect(tasks.nth(1).getByText('Roteiro para aprovar', { exact: true })).toBeVisible({
      timeout: 60_000,
    });

    // Roteiro: o admin corrige a narração (que vira a legenda) e aprova. Nada pago ainda.
    await tasks.nth(1).getByRole('link', { name: 'Acompanhar a geração' }).click();
    const midia = page.getByRole('region', { name: 'Mídia do vídeo' });
    await expect(midia.getByText('0 créditos de mídia nesta tarefa')).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze())
        .violations,
    ).toEqual([]);
    await midia
      .getByLabel('Narração da cena 1')
      .fill('A insulina sai das células beta do pâncreas e chega ao receptor da célula muscular.');
    await midia.getByRole('button', { name: 'Aprovar roteiro e gerar imagens' }).click();
    await expect(page.getByText('Imagens para aprovar', { exact: true }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(midia.getByRole('img', { name: /Imagem gerada da cena/ })).toHaveCount(3);
    await expect(midia.getByText('6 créditos de mídia nesta tarefa')).toBeVisible();

    // Refazer a imagem da cena 2 com outra descrição: novo pedido, novos créditos.
    await midia.getByRole('button', { name: 'Refazer imagem' }).nth(1).click();
    await midia
      .getByLabel('Descrição da imagem')
      .fill('Muscle cell membrane with insulin receptor, realistic, no text.');
    await midia.getByRole('button', { name: 'Pedir nova imagem' }).click();
    await expect(midia.getByText('pedido 2')).toBeVisible({ timeout: 60_000 });
    await expect(midia.getByText('8 créditos de mídia nesta tarefa')).toBeVisible();

    // Aprovar as imagens: clipes, narração e montagem andam sozinhos até o vídeo.
    await midia.getByRole('button', { name: 'Aprovar imagens e animar' }).click();
    await expect(page.getByRole('heading', { name: 'Prévia da versão 1' })).toBeVisible({
      timeout: 180_000,
    });
    await expect(midia.getByText('50 créditos de mídia nesta tarefa')).toBeVisible();
    await expect(midia.getByLabel('Vídeo montado com narração, legenda e rótulos')).toBeVisible();
    await expect(midia.getByText('A insulina sai das células beta do pâncreas')).toBeVisible();

    // A prévia isolada toca o vídeo montado (a política da peça deixa a mídia passar).
    const frame = page.frameLocator('iframe[title="Peça no tema claro"]');
    const video = frame.getByLabel(/Vídeo com narração/);
    await expect(video).toBeVisible();
    await expect
      .poll(async () => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 30_000 })
      .toBeGreaterThan(0);
    expect(await video.evaluate((v: HTMLVideoElement) => v.duration)).toBeGreaterThan(3);
    await expect(frame.getByText('Demonstração · sem revisão')).toBeVisible();
  });

  test('revisão: o revisor pede ajuste, aprova e publica; o aluno vê a aula sem selo', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const title = `Aula revisada · ${Date.now().toString(36)}`;
    await becomeAdmin(page, 'Ana Produção');
    await page.goto('/admin/producao');
    await page.getByLabel('Disciplina').selectOption({ label: 'Fisiologia cardiovascular' });
    await page.getByLabel('Nome da aula').fill(title);
    await page.getByLabel('Arquivo da aula').setInputFiles(AULA);
    await page.getByRole('button', { name: 'Enviar e criar o lote' }).click();
    await expect(page).toHaveURL(/\/admin\/producao\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByText('Plano pronto')).toBeVisible({ timeout: 90_000 });
    const tasks = page.getByRole('list', { name: 'Tarefas do lote' }).getByRole('article');
    for (const i of [0, 1]) {
      await tasks.nth(i).getByRole('button', { name: 'Aprovar' }).click();
      await expect(tasks.nth(i).getByText('Aprovada', { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Liberar geração' }).click();
    for (const i of [0, 1])
      await expect(tasks.nth(i).getByText('Peça pronta', { exact: true })).toBeVisible({
        timeout: 120_000,
      });

    // As peças prontas vão para a revisão: viram módulos e as questões do plano vão junto.
    const revisao = page.getByRole('region', { name: 'Revisão médica' });
    await revisao.getByRole('button', { name: 'Enviar 2 peças para revisão' }).click();
    await expect(revisao.getByRole('status')).toHaveText(
      '2 peças foram para a revisão, com 3 questões.',
    );

    // Outra pessoa, com papel de revisor, revisa.
    const rctx = await browser.newContext();
    const rev = await rctx.newPage();
    const revEmail = uniqueEmail('revisor');
    await signUp(rev, 'Rafael Revisor', revEmail);
    await promote(revEmail, 'reviewer');
    await rev.goto('/admin/revisao');
    await expect(rev.getByRole('heading', { name: 'Revisão de aulas', level: 1 })).toBeVisible();
    const aula = rev.getByRole('region', { name: title });
    await expect(aula.getByText('Para revisar', { exact: true })).toHaveCount(2);
    expect(
      (await new AxeBuilder({ page: rev }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze())
        .violations,
    ).toEqual([]);

    // A peça com prioridade do professor tem 3 questões e um ponto de atenção da IA.
    await aula.getByRole('link', { name: /^02 · / }).click();
    await expect(rev.getByText('A IA pediu atenção do revisor em:')).toBeVisible();
    await expect(rev.getByRole('heading', { name: 'Questões (3)' })).toBeVisible();
    const frame = rev.frameLocator('iframe[title="Peça em revisão no tema claro"]');
    await expect(frame.getByText('Demonstração · sem revisão')).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page: rev })
          .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
          .exclude('iframe')
          .analyze()
      ).violations,
    ).toEqual([]);

    // Pedir ajuste num trecho: a IA gera a versão 2 e a peça volta para a revisão.
    await rev.getByLabel('Trecho').selectOption('Na prova');
    await rev
      .getByLabel('Comentário para o ajuste')
      .fill('Trocar a pegadinha pelo uso de corticoide.');
    await rev.getByRole('button', { name: 'Pedir ajuste' }).click();
    await expect(rev.getByRole('heading', { name: 'Peça, versão 2' })).toBeVisible({
      timeout: 120_000,
    });
    const historico = rev.getByRole('region', { name: 'Histórico da revisão' });
    await expect(historico.getByText('Pediu ajuste')).toBeVisible();
    await expect(historico.getByText('Trecho: Na prova')).toBeVisible();

    // Aprovar, tirando a questão 3 da aula: o selo sai.
    await rev.getByRole('checkbox', { name: /Questão 3/ }).uncheck();
    await rev.getByRole('button', { name: 'Aprovar peça e questões' }).click();
    await expect(rev.getByText('Peça aprovada. Ela vai para os alunos')).toBeVisible();
    await rev.reload();
    await expect(frame.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(frame.getByText('Demonstração · sem revisão')).toHaveCount(0);

    await rev.goto('/admin/revisao');
    await aula.getByRole('link', { name: /^01 · / }).click();
    await rev.getByRole('button', { name: 'Aprovar peça e questões' }).click();
    await expect(rev.getByText('Peça aprovada. Ela vai para os alunos')).toBeVisible();

    await rev.goto('/admin/revisao');
    await aula.getByRole('button', { name: 'Publicar a aula (2 peças aprovadas)' }).click();
    await expect(aula.getByRole('status')).toHaveText(
      '2 peças publicadas. Os alunos já veem a aula.',
    );
    await rctx.close();

    // O aluno abre o módulo publicado e vê a peça, isolada e sem o selo de demonstração.
    const db = ownerDb();
    const batch = (await db.query.productionBatches.findFirst({
      where: eq(s.productionBatches.title, title),
    }))!;
    const second = (await db.query.productionTasks.findFirst({
      where: (t, { and }) => and(eq(t.batchId, batch.id), eq(t.position, 2)),
    }))!;
    const mod = (await db.query.modules.findFirst({ where: eq(s.modules.id, second.moduleId!) }))!;
    const disc = (await db.query.disciplines.findFirst({
      where: eq(s.disciplines.id, mod.disciplineId),
    }))!;
    expect(mod).toMatchObject({ status: 'published', isDemo: false });
    expect(second.questionIds).toHaveLength(2);

    const sctx = await browser.newContext();
    const stu = await sctx.newPage();
    await signUp(stu, 'Sofia Aluna', uniqueEmail('aluna-prod'));
    await completeOnboarding(stu);
    await stu.goto(`/app/disciplinas/${disc.slug}/${mod.slug}`);
    await expect(stu.getByRole('heading', { name: mod.title, level: 1 })).toBeVisible();
    const lesson = stu.frameLocator(`iframe[title="Aula interativa: ${mod.title}"]`);
    await expect(lesson.getByText('Na prova')).toBeVisible();
    await expect(lesson.getByText('Demonstração · sem revisão')).toHaveCount(0);
    await sctx.close();
  });
});
