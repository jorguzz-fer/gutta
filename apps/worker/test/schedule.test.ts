import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  FakeScheduleExtractor,
  type ExtractInput,
  type ExtractResult,
  type ScheduleExtractor,
} from '@gutta/ai';
import { and, eq, schema as s, sql } from '@gutta/db';
import { keys, MemoryStorage } from '@gutta/storage';
import { connect, makeUser } from '../../../packages/db/test/helpers';
import { logger } from '../src/logger';
import { NoScanner } from '../src/files/scanner';
import { filesProcess } from '../src/handlers/files';
import { extractSchedule, SCHEDULE_MESSAGES } from '../src/handlers/schedule';
import type { JobContext } from '../src/handlers/types';

// Leitura do cronograma pela IA (SPEC v2, DIS-05; plano, item 41).
const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, 'fixtures', name));
const PDF = fixture('cronograma.pdf');
const XLSX = fixture('cronograma.xlsx');
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const { app, owner, appPool, ownerPool } = connect();
const store = new MemoryStorage();
const ctx = (): JobContext => ({ db: app, log: logger, jobId: 'teste', attempt: 1 });
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Extrator que guarda a entrada e devolve o que o falso leria. */
class SpyExtractor implements ScheduleExtractor {
  inputs: ExtractInput[] = [];
  constructor(private refused = false) {}
  async extract(input: ExtractInput): Promise<ExtractResult> {
    this.inputs.push(input);
    const r = await new FakeScheduleExtractor().extract(input);
    return this.refused ? { ...r, refused: true, model: 'spy' } : { ...r, model: 'spy' };
  }
}

async function scenario(opts: {
  body?: Buffer;
  mime?: string;
  consent?: boolean | null;
  fileStatus?: 'scanning' | 'ready' | 'failed';
  importStatus?: 'waiting_file' | 'extracting';
}) {
  const body = opts.body ?? PDF;
  const userId = await makeUser(owner);
  if (opts.consent !== null)
    await owner.insert(s.consentRecords).values({
      userId,
      purpose: 'ai_materials',
      granted: opts.consent ?? true,
      policyVersion: 'teste',
    });
  const [t] = await owner
    .insert(s.studentTerms)
    .values({ ownerId: userId, label: '2026.2' })
    .returning();
  const [d] = await owner
    .insert(s.enrolledDisciplines)
    .values({ ownerId: userId, termId: t!.id, name: 'Fisiopatologia' })
    .returning();
  const [f] = await owner
    .insert(s.files)
    .values({
      ownerId: userId,
      originalName: 'cronograma',
      mime: opts.mime ?? 'application/pdf',
      sizeBytes: body.length,
      sha256: sha(body),
      status: opts.fileStatus ?? 'scanning',
      error: opts.fileStatus === 'failed' ? 'O antivírus bloqueou este arquivo.' : null,
    })
    .returning();
  await store.put(keys.original(userId, f!.id), body, opts.mime ?? 'application/pdf');
  const [imp] = await owner
    .insert(s.scheduleImports)
    .values({
      ownerId: userId,
      disciplineId: d!.id,
      fileId: f!.id,
      referenceYear: 2026,
      status: opts.importStatus ?? 'waiting_file',
    })
    .returning();
  return { userId, fileId: f!.id, importId: imp!.id };
}

const importRow = async (id: string) =>
  (await owner.query.scheduleImports.findFirst({ where: eq(s.scheduleImports.id, id) }))!;
const process = filesProcess({ storage: store, scanner: new NoScanner() });

beforeAll(() => {
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'info').mockImplementation(() => {});
});
afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('arquivo pronto libera a importação', () => {
  it('PDF processado: a importação vai para a leitura e o evento entra no outbox', async () => {
    const { userId, fileId, importId } = await scenario({});
    await process.run({ fileId, userId }, ctx());
    expect((await importRow(importId)).status).toBe('extracting');
    const events = await owner
      .select()
      .from(s.outbox)
      .where(
        and(
          eq(s.outbox.topic, 'ai.extract_schedule'),
          sql`${s.outbox.payload}->>'importId' = ${importId}`,
        ),
      );
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toEqual({ importId, userId });
  });

  it('arquivo recusado também libera, e a leitura falha com o motivo do arquivo', async () => {
    const bad = Buffer.from('não é pdf de verdade');
    const { userId, fileId, importId } = await scenario({ body: bad });
    await process.run({ fileId, userId }, ctx());
    expect((await importRow(importId)).status).toBe('extracting');
    await extractSchedule({ storage: store, extractor: new SpyExtractor() }).run(
      { importId, userId },
      ctx(),
    );
    const row = await importRow(importId);
    expect(row.status).toBe('failed');
    expect(row.error).toBe('O conteúdo não confere com o tipo do arquivo.');
  });
});

describe('leitura', () => {
  it('PDF com texto: itens extraídos, pronto para conferir, uso de IA registrado', async () => {
    const { userId, fileId, importId } = await scenario({});
    await process.run({ fileId, userId }, ctx());
    const spy = new SpyExtractor();
    const job = extractSchedule({ storage: store, extractor: spy });
    await job.run({ importId, userId }, ctx());
    const row = await importRow(importId);
    expect(row.status).toBe('ready');
    const extracted = row.extracted as { events: { type: string; title: string }[] };
    expect(extracted.events.map((e) => [e.type, e.title])).toEqual([
      ['aula', 'Inflamação aguda'],
      ['pratica', 'Laboratório de histopatologia'],
      ['aula', 'Choque séptico'],
      ['prova', 'P1'],
      ['entrega', 'Relatório de caso clínico'],
    ]);
    expect(spy.inputs[0]!.pdf).toBeUndefined();
    // Aviso de conferência pendente, um por leitura (LEM-15).
    const notes = await owner
      .select()
      .from(s.notifications)
      .where(eq(s.notifications.dedupeKey, `import:${importId}`));
    expect(notes).toMatchObject([
      { type: 'schedule_ready', link: `/app/minhas-disciplinas/cronograma/${importId}` },
    ]);
    expect(spy.inputs[0]!.referenceYear).toBe(2026);
    const usage = await owner.select().from(s.aiUsage).where(eq(s.aiUsage.ownerId, userId));
    expect(usage).toMatchObject([{ feature: 'schedule_extract', model: 'spy', refused: false }]);

    // Rodar de novo (trabalho repetido) não chama a IA outra vez.
    await job.run({ importId, userId }, ctx());
    expect(spy.inputs).toHaveLength(1);
  });

  it('planilha: todas as abas viram texto para a IA', async () => {
    const { userId, fileId, importId } = await scenario({ body: XLSX, mime: XLSX_MIME });
    await process.run({ fileId, userId }, ctx());
    const spy = new SpyExtractor();
    await extractSchedule({ storage: store, extractor: spy }).run({ importId, userId }, ctx());
    expect((await importRow(importId)).status).toBe('ready');
    const text = spy.inputs[0]!.text;
    expect(text).toContain('Aba: Agosto');
    expect(text).toContain('Choque séptico');
    expect(text).toContain('Aba: Setembro');
  });

  it('PDF sem texto (digitalizado): o PDF vai para o modelo', async () => {
    const { userId, fileId, importId } = await scenario({
      fileStatus: 'ready',
      importStatus: 'extracting',
    });
    await owner.update(s.files).set({ kind: 'pdf', pageCount: 1 }).where(eq(s.files.id, fileId));
    await owner.insert(s.filePages).values({ fileId, ownerId: userId, page: 1, text: '  ' });
    const spy = new SpyExtractor();
    await extractSchedule({ storage: store, extractor: spy }).run({ importId, userId }, ctx());
    expect(spy.inputs[0]!.pdf?.equals(PDF)).toBe(true);
  });

  it('sem autorização para a IA ler materiais: pede o consentimento', async () => {
    for (const consent of [null, false]) {
      const { userId, importId } = await scenario({
        consent,
        fileStatus: 'ready',
        importStatus: 'extracting',
      });
      const spy = new SpyExtractor();
      await extractSchedule({ storage: store, extractor: spy }).run({ importId, userId }, ctx());
      expect((await importRow(importId)).status).toBe('needs_consent');
      expect(spy.inputs).toHaveLength(0);
    }
  });

  it('sem provedor de IA: falha com aviso para cadastrar à mão', async () => {
    const { userId, importId } = await scenario({
      fileStatus: 'ready',
      importStatus: 'extracting',
    });
    await extractSchedule({ storage: store, extractor: null }).run({ importId, userId }, ctx());
    expect(await importRow(importId)).toMatchObject({
      status: 'failed',
      error: SCHEDULE_MESSAGES.unavailable,
    });
  });

  it('pausada pelo admin: falha com aviso para cadastrar à mão, sem chamar a IA', async () => {
    const { userId, importId } = await scenario({
      fileStatus: 'ready',
      importStatus: 'extracting',
    });
    const extractor = {
      extract: async () => {
        throw new Error('não devia chamar');
      },
    };
    await extractSchedule({
      storage: store,
      extractor: extractor as never,
      featureOn: async () => false,
    }).run({ importId, userId }, ctx());
    expect(await importRow(importId)).toMatchObject({
      status: 'failed',
      error: SCHEDULE_MESSAGES.paused,
    });
  });

  it('recusa do modelo: falha com aviso e o uso fica registrado', async () => {
    const { userId, fileId, importId } = await scenario({});
    await process.run({ fileId, userId }, ctx());
    await extractSchedule({ storage: store, extractor: new SpyExtractor(true) }).run(
      { importId, userId },
      ctx(),
    );
    expect(await importRow(importId)).toMatchObject({
      status: 'failed',
      error: SCHEDULE_MESSAGES.refused,
    });
    const usage = await owner.select().from(s.aiUsage).where(eq(s.aiUsage.ownerId, userId));
    expect(usage[0]!.refused).toBe(true);
  });

  it('tentativas esgotadas: falha com aviso para tentar de novo', async () => {
    const { userId, importId } = await scenario({
      fileStatus: 'ready',
      importStatus: 'extracting',
    });
    await extractSchedule({ storage: store, extractor: null }).onDead!(
      { importId, userId },
      ctx(),
      'erro',
    );
    expect((await importRow(importId)).error).toBe(SCHEDULE_MESSAGES.dead);
  });
});
