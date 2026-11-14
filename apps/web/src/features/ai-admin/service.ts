import 'server-only';
import { AI_FEATURES, readAiSettings, sql, withUser, type AiFeature } from '@gutta/db';
import { schema as s } from '@gutta/db';
import { z } from 'zod';
import type { CurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { audit } from '@/lib/events';

/*
  Rede de proteção da camada de IA (SPEC v2, 7.7; plano, item 64): gasto total e por recurso,
  alerta acima de um valor configurável e um interruptor por recurso. Sem teto por aluno durante
  o QA (D07): o alerta não bloqueia ninguém. Custos estimados pela tabela de preços.
*/

export const FEATURE_LABEL: Record<AiFeature, string> = {
  cronograma: 'Leitura do cronograma',
  criacao: 'Criar com IA',
  tutor_materiais: 'Tutor sobre os materiais',
};

/** Rótulo de cada valor de `ai_usage.feature` (e do tutor do módulo, em `tutor_messages`). */
export function usageLabel(feature: string) {
  const kinds: Record<string, string> = {
    resumo: 'resumo',
    flashcards: 'flashcards',
    questoes: 'questões',
    mapa: 'mapa mental',
    roteiro: 'roteiro',
  };
  if (feature === 'schedule_extract') return 'Leitura do cronograma';
  if (feature === 'tutor_materiais') return 'Tutor sobre os materiais';
  if (feature === 'tutor_modulo') return 'Tutor do módulo (MVP)';
  if (feature.startsWith('criacao_'))
    return `Criar com IA: ${kinds[feature.slice(8)] ?? feature.slice(8)}`;
  return feature;
}

type Row = {
  feature: string;
  calls: number;
  students: number;
  cost: number;
  refused: number;
  input: number;
  output: number;
};

export async function aiAdminOverview(admin: CurrentUser) {
  return withUser(db(), admin.id, async (tx) => {
    const settings = await readAiSettings(tx);
    // Mês corrente no fuso de São Paulo, como a função do alerta.
    const since = sql`(date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`;
    const totals = (
      await tx.execute<{ day: number; week: number; month: number; month_to_date: number }>(sql`
        with u as (
          select created_at, cost_micros from ai_usage
          union all
          select created_at, cost_micros from tutor_messages where role = 'assistant'
        )
        select coalesce(sum(cost_micros) filter (where created_at > now() - interval '1 day'), 0)::bigint::float8 as day,
               coalesce(sum(cost_micros) filter (where created_at > now() - interval '7 days'), 0)::bigint::float8 as week,
               coalesce(sum(cost_micros) filter (where created_at > now() - interval '30 days'), 0)::bigint::float8 as month,
               coalesce(sum(cost_micros) filter (where created_at >= ${since}), 0)::bigint::float8 as month_to_date
        from u`)
    ).rows[0]!;
    const byFeature = (
      await tx.execute<Row>(sql`
        with u as (
          select feature, owner_id, cost_micros, refused, input_tokens, output_tokens, created_at
          from ai_usage
          union all
          select 'tutor_modulo', student_id, cost_micros, refused, input_tokens, output_tokens, created_at
          from tutor_messages where role = 'assistant'
        )
        select feature,
               count(*)::int as calls,
               count(distinct owner_id)::int as students,
               coalesce(sum(cost_micros), 0)::bigint::float8 as cost,
               (count(*) filter (where refused))::int as refused,
               coalesce(sum(input_tokens), 0)::bigint::float8 as input,
               coalesce(sum(output_tokens), 0)::bigint::float8 as output
        from u where created_at > now() - interval '30 days'
        group by feature order by cost desc`)
    ).rows.map((r) => ({ ...r, label: usageLabel(r.feature) }));
    const alerts = await tx
      .select()
      .from(s.aiSpendAlerts)
      .orderBy(sql`${s.aiSpendAlerts.period} desc`)
      .limit(6);
    const thresholdMicros = settings.alertMonthlyUsd ? settings.alertMonthlyUsd * 1e6 : null;
    return {
      settings,
      totals,
      byFeature,
      alerts,
      overThreshold: thresholdMicros !== null && totals.month_to_date >= thresholdMicros,
    };
  });
}

export const aiSettingsInput = z
  .record(z.string(), z.unknown())
  .transform((form) => ({
    alertMonthlyUsd: String(form.alertMonthlyUsd ?? '')
      .trim()
      .replace(',', '.'),
    disabled: AI_FEATURES.filter((f) => form[`on_${f}`] !== 'on'),
  }))
  .pipe(
    z.object({
      alertMonthlyUsd: z
        .string()
        .refine(
          (v) => v === '' || /^\d{1,6}(\.\d{1,2})?$/.test(v),
          'Use um valor em dólares, como 50 ou 12,50.',
        )
        .transform((v) => (v === '' || Number(v) === 0 ? null : Number(v))),
      disabled: z.array(z.enum(AI_FEATURES)),
    }),
  );

export async function saveAiSettings(admin: CurrentUser, raw: unknown) {
  const v = aiSettingsInput.parse(raw);
  return withUser(db(), admin.id, async (tx) => {
    await tx
      .insert(s.appSettings)
      .values({ key: 'ai', value: v, updatedBy: admin.id })
      .onConflictDoUpdate({
        target: s.appSettings.key,
        set: { value: v, updatedBy: admin.id, updatedAt: new Date() },
      });
    await audit(tx, admin.id, 'ai.settings_updated', { type: 'app_settings', id: 'ai' }, v);
    return v;
  });
}
