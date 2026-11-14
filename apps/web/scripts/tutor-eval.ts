/*
  Roda as baterias de avaliação do tutor contra a API real e imprime acertos por categoria:
  a do módulo (MVP) e a do tutor sobre os materiais (SPEC v2, 7.7).
  Uso: ANTHROPIC_API_KEY=... pnpm --filter @gutta/web tutor:eval
  Mesmo prompt e mesma chamada do app (provider.ts), sem servidor nem banco.
*/
import Anthropic from '@anthropic-ai/sdk';
import { ANSWERED_NONE, CASES, MATERIAL_MCH } from '../src/features/tutor/eval/cases';
import {
  EVAL_DOUBTS,
  EVAL_MATERIAL,
  gradeMaterialCase,
  MATERIAL_CASES,
} from '../src/features/tutor/eval/material-cases';
import { MATERIAL_TUTOR_RULES } from '../src/features/tutor/material-prompt';
import { costMicros } from '../src/features/tutor/pricing';
import { TUTOR_RULES } from '../src/features/tutor/prompt';

const model = process.env.TUTOR_MODEL ?? 'claude-opus-5-5';
const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });

let cost = 0;

/** A mesma chamada do provider.ts: regras, material com cache e o terceiro bloco. */
async function ask(rules: string, material: string, third: string, message: string) {
  const res = await client.beta.messages.create({
    model,
    max_tokens: 2000,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [
      { type: 'text', text: rules },
      { type: 'text', text: material, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: third },
    ],
    messages: [{ role: 'user', content: message }],
  });
  cost += costMicros(res.model, {
    input: res.usage.input_tokens,
    output: res.usage.output_tokens,
    cacheRead: res.usage.cache_read_input_tokens ?? 0,
    cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
  });
  return {
    text: res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n'),
    refused: res.stop_reason === 'refusal',
  };
}

async function main() {
  const byCat = new Map<string, { ok: number; total: number }>();
  const failures: string[] = [];
  const total = CASES.length + MATERIAL_CASES.length;
  for (const c of CASES) {
    const { text, refused } = await ask(TUTOR_RULES, MATERIAL_MCH, ANSWERED_NONE, c.message);
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
  // Tutor sobre os materiais: fidelidade, citação de página, fora do material e injeção.
  for (const c of MATERIAL_CASES) {
    const { text, refused } = await ask(
      MATERIAL_TUTOR_RULES,
      EVAL_MATERIAL,
      EVAL_DOUBTS,
      c.message,
    );
    const g = gradeMaterialCase(c, text, refused);
    const key = `materiais/${c.category}`;
    const cat = byCat.get(key) ?? { ok: 0, total: 0 };
    cat.total++;
    if (g.ok) cat.ok++;
    else
      failures.push(
        `${c.id} (${key}, ${g.reasons.join('; ')}): ${c.message}\n→ ${text.slice(0, 300).replace(/\n/g, ' ')}`,
      );
    byCat.set(key, cat);
    process.stdout.write(g.ok ? '.' : 'F');
  }
  console.log('\n');
  for (const [k, v] of byCat) console.log(`${k.padEnd(30)} ${v.ok}/${v.total}`);
  const ok = [...byCat.values()].reduce((a, v) => a + v.ok, 0);
  console.log(
    `\ntotal ${ok}/${total} · modelo ${model} · custo estimado US$ ${(cost / 1e6).toFixed(3)}`,
  );
  if (failures.length) console.log(`\nFalhas:\n${failures.join('\n\n')}`);
  process.exit(ok === total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
