/*
  Experimento de extração de cronograma (plano, item 36; SPEC v2, DIS-05).
  Uso: ANTHROPIC_API_KEY=... pnpm --filter @gutta/ai schedule:eval [pasta] [--model=...] [--effort=...]
  Pasta padrão: docs/experimentos/cronogramas. Para cada arquivo NOME.pdf|docx|xlsx|…, um
  NOME.esperado.json com o gabarito (formato em docs/experimentos/cronogramas/README.md).
  O texto sai pelas mesmas ferramentas do worker (Poppler e LibreOffice). Gasta créditos da API.
*/
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicScheduleExtractor, type ExpectedEvent, scoreSchedule } from '../src';

const run = promisify(execFile);
const args = process.argv.slice(2);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const dir = path.resolve(
  args.find((a) => !a.startsWith('--')) ??
    path.join(import.meta.dirname, '../../../docs/experimentos/cronogramas'),
);
const model = opt('model') ?? 'claude-opus-5-5';
const effort = (opt('effort') ?? 'medium') as 'low' | 'medium' | 'high';

async function textOf(file: string): Promise<string> {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf')
    return (await run('pdftotext', ['-layout', file, '-'], { maxBuffer: 64 << 20 })).stdout;
  if (ext === '.txt' || ext === '.csv') return readFile(file, 'utf8');
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'cron-'));
  try {
    const sheet = ['.xlsx', '.xls', '.ods'].includes(ext);
    await run('soffice', [
      `-env:UserInstallation=file://${tmp}/perfil`,
      '--headless',
      '--convert-to',
      sheet ? 'csv' : 'txt:Text (encoded):UTF8',
      '--outdir',
      tmp,
      file,
    ]);
    const out = (await readdir(tmp)).find((f) => f.endsWith(sheet ? '.csv' : '.txt'))!;
    return readFile(path.join(tmp, out), 'utf8');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

type Expected = { referenceYear: number; events: ExpectedEvent[] };

async function main() {
  const names = (await readdir(dir)).filter(
    (f) => !f.endsWith('.json') && !f.endsWith('.md') && !f.startsWith('.'),
  );
  if (names.length === 0) {
    console.error(`Nenhum cronograma em ${dir}. Veja o README da pasta.`);
    process.exit(1);
  }
  const extractor = new AnthropicScheduleExtractor(
    new Anthropic({ timeout: 300_000, maxRetries: 1 }),
    model,
    effort,
  );
  let cost = 0;
  const totals = { expected: 0, extracted: 0, matched: 0 };
  const fieldTotals: Record<string, { right: number; total: number }> = {};
  for (const name of names) {
    const base = name.replace(/\.[^.]+$/, '');
    const expectedFile = path.join(dir, `${base}.esperado.json`);
    const expected = JSON.parse(await readFile(expectedFile, 'utf8')) as Expected;
    const started = Date.now();
    const text = await textOf(path.join(dir, name));
    const r = await extractor.extract({
      text,
      referenceYear: expected.referenceYear,
      fileName: name,
    });
    const s = scoreSchedule(expected.events, r.data.events);
    cost += r.costMicros;
    totals.expected += s.expected;
    totals.extracted += s.extracted;
    totals.matched += s.matched;
    for (const [k, v] of Object.entries(s.fields)) {
      fieldTotals[k] ??= { right: 0, total: 0 };
      fieldTotals[k]!.right += v.right;
      fieldTotals[k]!.total += v.total;
    }
    console.log(
      `${name}: ${s.matched}/${s.expected} encontrados, ${s.extra.length} a mais, US$ ${(r.costMicros / 1e6).toFixed(4)}, ${((Date.now() - started) / 1000).toFixed(1)} s${r.refused ? ' (recusado)' : ''}`,
    );
    for (const m of s.missing) console.log(`   faltou: ${m.date} ${m.type} ${m.title}`);
    for (const x of s.extra) console.log(`   a mais: ${x.date} ${x.type} ${x.title}`);
  }
  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—');
  console.log(`\nModelo ${model}, esforço ${effort}, ${names.length} cronogramas`);
  console.log(`Encontrados (recall): ${pct(totals.matched, totals.expected)}`);
  console.log(`Corretos entre os extraídos (precisão): ${pct(totals.matched, totals.extracted)}`);
  for (const [k, v] of Object.entries(fieldTotals))
    console.log(`  ${k}: ${pct(v.right, v.total)} (${v.total})`);
  console.log(
    `Custo total US$ ${(cost / 1e6).toFixed(4)}; por cronograma US$ ${(cost / 1e6 / names.length).toFixed(4)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
