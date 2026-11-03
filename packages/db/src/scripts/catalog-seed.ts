import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../client';
import * as s from '../schema';
import { seedFlashcards, seedQuestions } from './seed-content';

/*
  Catálogo e conteúdo de DEMONSTRAÇÃO (ADR 0005): curso, instituições, disciplinas, assuntos,
  módulos, questões e flashcards, tudo com is_demo e o selo na interface. Sem usuários.
  Idempotente. Roda pelo seed local e, em produção, só com SEED_CATALOG=demo (migrate-cli).
  Fica fora do seed.ts para não levar o argon2 (nativo) para o migrate empacotado.
*/

async function upsertCourse(db: Db, slug: string, name: string) {
  await db.insert(s.courses).values({ slug, name, isDemo: true }).onConflictDoNothing();
  const row = await db.query.courses.findFirst({ where: eq(s.courses.slug, slug) });
  return row!.id;
}

async function upsertDiscipline(
  db: Db,
  courseId: string,
  d: { slug: string; name: string; description: string; periodHint: number },
) {
  await db
    .insert(s.disciplines)
    .values({ ...d, courseId, isDemo: true })
    .onConflictDoNothing();
  const row = await db.query.disciplines.findFirst({
    where: and(eq(s.disciplines.courseId, courseId), eq(s.disciplines.slug, d.slug)),
  });
  return row!.id;
}

async function upsertTopic(
  db: Db,
  disciplineId: string,
  t: { slug: string; name: string; orderIndex: number; parentId?: string },
) {
  await db
    .insert(s.topics)
    .values({ ...t, disciplineId })
    .onConflictDoNothing();
  const row = await db.query.topics.findFirst({
    where: and(eq(s.topics.disciplineId, disciplineId), eq(s.topics.slug, t.slug)),
  });
  return row!.id;
}

export type CatalogSeed = {
  courseId: string;
  disciplines: Record<string, string>;
  topics: Record<string, string>;
};

export async function seedCatalog(
  db: Db,
  ctx: { authorId: string | null; reviewerId: string | null },
): Promise<CatalogSeed> {
  // Instituições: a Uni9 é a parceira do piloto (roadmap); a outra é exemplo.
  await db
    .insert(s.institutions)
    .values([
      {
        name: 'Universidade Nove de Julho (Uni9)',
        state: 'SP',
        city: 'São Paulo',
        status: 'active',
      },
      {
        name: 'Instituição de exemplo (demonstração)',
        state: 'SP',
        city: 'São Paulo',
        status: 'active',
        isDemo: true,
      },
    ])
    .onConflictDoNothing();

  const courseId = await upsertCourse(db, 'medicina', 'Medicina');
  const disciplines = {
    fisiologia: await upsertDiscipline(db, courseId, {
      slug: 'fisiologia-cardiovascular',
      name: 'Fisiologia cardiovascular',
      description: 'Ciclo cardíaco, débito e pressão: a base para entender as cardiopatias.',
      periodHint: 2,
    }),
    fisiopatologia: await upsertDiscipline(db, courseId, {
      slug: 'fisiopatologia-cardiovascular',
      name: 'Fisiopatologia cardiovascular',
      description: 'Trilha do piloto, a partir da aula interativa de miocardiopatia hipertrófica.',
      periodHint: 4,
    }),
  };

  const topics: Record<string, string> = {};
  topics.cicloCardiaco = await upsertTopic(db, disciplines.fisiologia, {
    slug: 'ciclo-cardiaco',
    name: 'Ciclo cardíaco',
    orderIndex: 1,
  });
  topics.debito = await upsertTopic(db, disciplines.fisiologia, {
    slug: 'debito-cardiaco',
    name: 'Débito cardíaco, pré-carga e pós-carga',
    orderIndex: 2,
  });
  topics.mch = await upsertTopic(db, disciplines.fisiopatologia, {
    slug: 'miocardiopatia-hipertrofica',
    name: 'Miocardiopatia hipertrófica',
    orderIndex: 1,
  });
  topics.mchObstrucao = await upsertTopic(db, disciplines.fisiopatologia, {
    slug: 'mch-obstrucao-via-de-saida',
    name: 'Obstrução da via de saída do VE',
    orderIndex: 1,
    parentId: topics.mch,
  });
  topics.mchDiastole = await upsertTopic(db, disciplines.fisiopatologia, {
    slug: 'mch-disfuncao-diastolica',
    name: 'Disfunção diastólica',
    orderIndex: 2,
    parentId: topics.mch,
  });
  topics.ic = await upsertTopic(db, disciplines.fisiopatologia, {
    slug: 'insuficiencia-cardiaca',
    name: 'Insuficiência cardíaca',
    orderIndex: 2,
  });

  const moduleRows = [
    {
      disciplineId: disciplines.fisiopatologia,
      topicId: topics.mch,
      slug: 'miocardiopatia-hipertrofica',
      title: 'Miocardiopatia hipertrófica',
      lead: 'Por que um coração mais grosso bombeia pior, e o que piora a obstrução.',
      lessonUrl: 'https://aula.alumine.com.br',
      estMinutes: 25,
      orderIndex: 1,
      summaryMd: [
        '> Resumo de demonstração, sem revisão editorial. Não use como referência clínica.',
        '',
        '## O que é',
        'Doença do miocárdio com hipertrofia do ventrículo esquerdo que não se explica por sobrecarga de pressão.',
        '',
        '## Por que importa',
        '- A hipertrofia reduz a complacência do VE: o problema principal é de enchimento (diástole).',
        '- Em parte dos casos, o septo hipertrofiado obstrui a via de saída do VE.',
        '- Tudo que diminui o volume do VE tende a piorar essa obstrução.',
      ].join('\n'),
    },
    {
      disciplineId: disciplines.fisiologia,
      topicId: topics.cicloCardiaco,
      slug: 'ciclo-cardiaco',
      title: 'Ciclo cardíaco',
      lead: 'Sístole, diástole e o que cada bulha está contando.',
      lessonUrl: null,
      estMinutes: 15,
      orderIndex: 1,
      summaryMd: [
        '> Resumo de demonstração, sem revisão editorial.',
        '',
        '## As fases',
        '- Contração isovolumétrica, ejeção, relaxamento isovolumétrico e enchimento.',
        '- A primeira bulha marca o fechamento das valvas atrioventriculares; a segunda, das semilunares.',
      ].join('\n'),
    },
  ];
  for (const m of moduleRows) {
    await db
      .insert(s.modules)
      .values({
        ...m,
        status: 'published',
        isDemo: true,
        authorId: ctx.authorId,
        reviewerId: ctx.reviewerId,
        publishedAt: sql`now()`,
      })
      .onConflictDoNothing();
  }

  await seedQuestions(db, { topics, ...ctx });
  await seedFlashcards(db, { topics, ...ctx });

  return { courseId, disciplines, topics };
}
