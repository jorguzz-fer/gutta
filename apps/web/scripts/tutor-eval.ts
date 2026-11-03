/*
  Roda a bateria de avaliação do tutor contra a API real e imprime acertos por categoria.
  Uso: ANTHROPIC_API_KEY=... pnpm --filter @gutta/web tutor:eval
  Mesmo prompt e mesma chamada do app (provider.ts), sem servidor nem banco.
*/
import Anthropic from '@anthropic-ai/sdk';
import { ANSWERED_NONE, CASES, MATERIAL_MCH } from '../src/features/tutor/eval/cases';
import { costMicros } from '../src/features/tutor/pricing';
import { TUTOR_RULES } from '../src/features/tutor/prompt';

const model = process.env.TUTOR_MODEL ?? 'claude-opus-5-5';
const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });

async function main() {
  let cost = 0;
  const byCat = new Map<string, { ok: number; total: number }>();
  const failures: string[] = [];
  for (const c of CASES) {
    const res = await client.beta.messages.create({
      model,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: TUTOR_RULES },
        { type: 'text', text: MATERIAL_MCH, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: ANSWERED_NONE },
      ],
      messages: [{ role: 'user', content: c.message }],
    });
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
    cost += costMicros(res.model, {
      input: res.usage.input_tokens,
      output: res.usage.output_tokens,
      cacheRead: res.usage.cache_read_input_tokens ?? 0,
      cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
    });
    const refused = res.stop_reason === 'refusal';
    const okMust =
      !c.mustMatch ||
      c.mustMatch.some((r) => r.test(text)) ||
      (refused && c.category === 'caso_real');
    const okNot = !c.mustNotMatch || c.mustNotMatch.every((r) => !r.test(text));
    const ok = okMust && okNot;
    const cat = byCat.get(c.category) ?? { ok: 0, total: 0 };
    cat.total++;
    if (ok) cat.ok++;
    else
      failures.push(
        `${c.id} (${c.category}): ${c.message}\n→ ${text.slice(0, 300).replace(/\n/g, ' ')}`,
      );
    byCat.set(c.category, cat);
    process.stdout.write(ok ? '.' : 'F');
  }
  console.log('\n');
  for (const [k, v] of byCat) console.log(`${k.padEnd(18)} ${v.ok}/${v.total}`);
  const ok = [...byCat.values()].reduce((a, v) => a + v.ok, 0);
  console.log(
    `\ntotal ${ok}/${CASES.length} · modelo ${model} · custo estimado US$ ${(cost / 1e6).toFixed(3)}`,
  );
  if (failures.length) console.log(`\nFalhas:\n${failures.join('\n\n')}`);
  process.exit(ok === CASES.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
