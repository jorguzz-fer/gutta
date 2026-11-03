import 'server-only';
import { and, asc, desc, eq, ilike, or, schema as s, sql, withUser, type Tx } from '@gutta/db';
import { z } from 'zod';
import { ApiError, notFound } from '@/lib/api';
import type { CurrentUser, Role } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { audit } from '@/lib/events';
import { forget } from '@/lib/memo';

/*
  Administração da empresa: catálogo (cursos, disciplinas, assuntos, módulos), instituições e
  usuários. Tudo roda em withUser com o admin no contexto, então o RLS continua valendo
  (courses_admin_write, institutions_admin_update…) e o banco recusa quem não é admin mesmo
  que a tela falhe. Cada mudança vai para a auditoria.
*/

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Aluno',
  teacher: 'Professor',
  editor: 'Editor',
  reviewer: 'Revisão',
  admin: 'Admin',
  moderator: 'Moderação',
  support: 'Suporte',
};
export const ASSIGNABLE_ROLES: Role[] = ['teacher', 'editor', 'reviewer', 'admin', 'support'];

export function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const slugField = z
  .string()
  .trim()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use só letras minúsculas, números e hífens no endereço.');
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null);
const optInt = (min: number, max: number) =>
  z
    .union([z.literal(''), z.coerce.number().int().min(min).max(max)])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null);
// Checkbox desmarcado não vem no formulário: ausente = false.
const checkbox = z
  .string()
  .nullish()
  .transform((v) => v === 'on' || v === 'true');

export const courseInput = z.object({
  name: z.string().trim().min(2, 'Dê um nome ao curso.').max(120),
  slug: slugField.or(z.literal('')).default(''),
  active: checkbox,
});
export const disciplineInput = z.object({
  name: z.string().trim().min(2, 'Dê um nome à disciplina.').max(160),
  slug: slugField.or(z.literal('')).default(''),
  description: optText(500),
  periodHint: optInt(1, 16),
  active: checkbox,
});
export const topicInput = z.object({
  name: z.string().trim().min(2, 'Dê um nome ao assunto.').max(160),
  parentId: z
    .union([z.literal(''), z.uuid()])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null),
  orderIndex: z.coerce.number().int().min(0).max(999).default(0),
});
export const moduleInput = z.object({
  title: z.string().trim().min(2, 'Dê um título ao módulo.').max(160),
  slug: slugField.or(z.literal('')).default(''),
  topicId: z.uuid('Escolha o assunto do módulo.'),
  lead: optText(300),
  lessonUrl: z
    .union([
      z.literal(''),
      z.url('Endereço da aula inválido.').startsWith('https://', 'Use https.'),
    ])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null),
  estMinutes: optInt(1, 240),
  orderIndex: z.coerce.number().int().min(0).max(999).default(0),
  summaryMd: optText(20000),
});
export const institutionInput = z.object({
  name: z.string().trim().min(3, 'Dê o nome da instituição.').max(200),
  city: optText(120),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .max(2)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null),
});

function dbError(err: unknown): never {
  const cause = (err as { cause?: { code?: string; message?: string; constraint?: string } }).cause;
  if (cause?.code === '23505')
    throw new ApiError(409, 'conflict', 'Já existe um item com esse nome ou endereço.');
  if (cause?.code === '42501')
    // A regra editorial do banco explica o motivo (ex.: autor aprovando o próprio conteúdo);
    // a recusa do RLS, não.
    throw new ApiError(
      403,
      'forbidden',
      cause.message && !cause.message.includes('row-level security')
        ? cause.message.charAt(0).toUpperCase() + cause.message.slice(1) + '.'
        : 'Sua conta não tem permissão para essa ação.',
    );
  if (cause?.code === '23514')
    throw new ApiError(409, 'invalid_transition', cause.message ?? 'Mudança de status inválida.');
  if (cause?.code === '23503')
    throw new ApiError(
      409,
      'in_use',
      'Esse item está em uso (tem conteúdo ou alunos ligados a ele). Desative em vez de excluir.',
    );
  throw err;
}

async function run<T>(admin: CurrentUser, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    const out = await withUser(db(), admin.id, fn);
    forget('painel:catalogo:');
    return out;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    dbError(err);
  }
}

// ── Cursos ────────────────────────────────────────────────────────────────

export async function listCourses(admin: CurrentUser) {
  return withUser(db(), admin.id, (tx) =>
    tx
      .select({
        id: s.courses.id,
        name: s.courses.name,
        slug: s.courses.slug,
        active: s.courses.active,
        isDemo: s.courses.isDemo,
        disciplines: sql<number>`(select count(*)::int from disciplines d where d.course_id = "courses"."id")`,
        students: sql<number>`(select count(*)::int from student_profiles sp where sp.course_id = "courses"."id")`,
      })
      .from(s.courses)
      .orderBy(asc(s.courses.name)),
  );
}

export async function getCourse(admin: CurrentUser, id: string) {
  return withUser(db(), admin.id, async (tx) => {
    const course = await tx.query.courses.findFirst({ where: eq(s.courses.id, id) });
    if (!course) throw notFound('Curso');
    const disciplines = await tx
      .select({
        id: s.disciplines.id,
        name: s.disciplines.name,
        slug: s.disciplines.slug,
        periodHint: s.disciplines.periodHint,
        active: s.disciplines.active,
        isDemo: s.disciplines.isDemo,
        modules: sql<number>`(select count(*)::int from modules m where m.discipline_id = "disciplines"."id")`,
        topics: sql<number>`(select count(*)::int from topics t where t.discipline_id = "disciplines"."id")`,
      })
      .from(s.disciplines)
      .where(eq(s.disciplines.courseId, id))
      .orderBy(asc(s.disciplines.periodHint), asc(s.disciplines.name));
    return { course, disciplines };
  });
}

export async function saveCourse(admin: CurrentUser, id: string | null, raw: unknown) {
  const v = courseInput.parse(raw);
  const values = { name: v.name, slug: v.slug || slugify(v.name), active: v.active };
  return run(admin, async (tx) => {
    if (id) {
      const [row] = await tx.update(s.courses).set(values).where(eq(s.courses.id, id)).returning();
      if (!row) throw notFound('Curso');
      await audit(tx, admin.id, 'course.updated', { type: 'course', id }, values);
      return row;
    }
    const [row] = await tx.insert(s.courses).values(values).returning();
    await audit(tx, admin.id, 'course.created', { type: 'course', id: row!.id }, values);
    return row!;
  });
}

// ── Disciplinas e assuntos ────────────────────────────────────────────────

export async function getDisciplineAdmin(admin: CurrentUser, id: string) {
  return withUser(db(), admin.id, async (tx) => {
    const discipline = await tx.query.disciplines.findFirst({ where: eq(s.disciplines.id, id) });
    if (!discipline) throw notFound('Disciplina');
    const course = await tx.query.courses.findFirst({
      where: eq(s.courses.id, discipline.courseId),
    });
    const topics = await tx
      .select({
        id: s.topics.id,
        name: s.topics.name,
        slug: s.topics.slug,
        parentId: s.topics.parentId,
        orderIndex: s.topics.orderIndex,
        questions: sql<number>`(select count(*)::int from questions q where q.topic_id = "topics"."id")`,
      })
      .from(s.topics)
      .where(eq(s.topics.disciplineId, id))
      .orderBy(asc(s.topics.orderIndex), asc(s.topics.name));
    const modules = await tx
      .select({
        id: s.modules.id,
        title: s.modules.title,
        slug: s.modules.slug,
        status: s.modules.status,
        version: s.modules.version,
        isDemo: s.modules.isDemo,
        orderIndex: s.modules.orderIndex,
      })
      .from(s.modules)
      .where(eq(s.modules.disciplineId, id))
      .orderBy(asc(s.modules.orderIndex), asc(s.modules.title));
    return { discipline, course: course!, topics, modules };
  });
}

export async function saveDiscipline(
  admin: CurrentUser,
  target: { id: string } | { courseId: string },
  raw: unknown,
) {
  const v = disciplineInput.parse(raw);
  const values = {
    name: v.name,
    slug: v.slug || slugify(v.name),
    description: v.description,
    periodHint: v.periodHint,
    active: v.active,
  };
  return run(admin, async (tx) => {
    if ('id' in target) {
      const [row] = await tx
        .update(s.disciplines)
        .set(values)
        .where(eq(s.disciplines.id, target.id))
        .returning();
      if (!row) throw notFound('Disciplina');
      await audit(tx, admin.id, 'discipline.updated', { type: 'discipline', id: row.id }, values);
      return row;
    }
    const [row] = await tx
      .insert(s.disciplines)
      .values({ ...values, courseId: target.courseId })
      .returning();
    await audit(tx, admin.id, 'discipline.created', { type: 'discipline', id: row!.id }, values);
    return row!;
  });
}

export async function saveTopic(
  admin: CurrentUser,
  target: { id: string } | { disciplineId: string },
  raw: unknown,
) {
  const v = topicInput.parse(raw);
  return run(admin, async (tx) => {
    if ('id' in target) {
      if (v.parentId === target.id)
        throw new ApiError(400, 'bad_request', 'Um assunto não pode ser pai dele mesmo.');
      const [row] = await tx
        .update(s.topics)
        .set({ name: v.name, parentId: v.parentId, orderIndex: v.orderIndex })
        .where(eq(s.topics.id, target.id))
        .returning();
      if (!row) throw notFound('Assunto');
      await audit(tx, admin.id, 'topic.updated', { type: 'topic', id: row.id }, { name: v.name });
      return row;
    }
    const [row] = await tx
      .insert(s.topics)
      .values({
        disciplineId: target.disciplineId,
        name: v.name,
        slug: slugify(v.name),
        parentId: v.parentId,
        orderIndex: v.orderIndex,
      })
      .returning();
    await audit(tx, admin.id, 'topic.created', { type: 'topic', id: row!.id }, { name: v.name });
    return row!;
  });
}

export async function deleteTopic(admin: CurrentUser, id: string) {
  return run(admin, async (tx) => {
    const [row] = await tx.delete(s.topics).where(eq(s.topics.id, id)).returning();
    if (!row) throw notFound('Assunto');
    await audit(tx, admin.id, 'topic.deleted', { type: 'topic', id }, { name: row.name });
    return row;
  });
}

// ── Módulos (com o fluxo editorial do banco) ──────────────────────────────

export async function getModuleAdmin(admin: CurrentUser, id: string) {
  return withUser(db(), admin.id, async (tx) => {
    const mod = await tx.query.modules.findFirst({ where: eq(s.modules.id, id) });
    if (!mod) throw notFound('Módulo');
    const discipline = await tx.query.disciplines.findFirst({
      where: eq(s.disciplines.id, mod.disciplineId),
    });
    const topics = await tx
      .select({ id: s.topics.id, name: s.topics.name, parentId: s.topics.parentId })
      .from(s.topics)
      .where(eq(s.topics.disciplineId, mod.disciplineId))
      .orderBy(asc(s.topics.orderIndex), asc(s.topics.name));
    const history = await tx
      .select()
      .from(s.auditLogs)
      .where(and(eq(s.auditLogs.entityType, 'module'), eq(s.auditLogs.entityId, id)))
      .orderBy(desc(s.auditLogs.createdAt))
      .limit(20);
    return { module: mod, discipline: discipline!, topics, history };
  });
}

export async function saveModule(
  admin: CurrentUser,
  target: { id: string } | { disciplineId: string },
  raw: unknown,
) {
  const v = moduleInput.parse(raw);
  const values = {
    title: v.title,
    slug: v.slug || slugify(v.title),
    topicId: v.topicId,
    lead: v.lead,
    lessonUrl: v.lessonUrl,
    estMinutes: v.estMinutes,
    orderIndex: v.orderIndex,
    summaryMd: v.summaryMd,
  };
  return run(admin, async (tx) => {
    if ('id' in target) {
      const [row] = await tx
        .update(s.modules)
        .set(values)
        .where(eq(s.modules.id, target.id))
        .returning();
      if (!row) throw notFound('Módulo');
      await audit(
        tx,
        admin.id,
        'module.updated',
        { type: 'module', id: row.id },
        { title: v.title },
      );
      return row;
    }
    const [row] = await tx
      .insert(s.modules)
      .values({ ...values, disciplineId: target.disciplineId, status: 'draft', authorId: admin.id })
      .returning();
    await audit(
      tx,
      admin.id,
      'module.created',
      { type: 'module', id: row!.id },
      { title: v.title },
    );
    return row!;
  });
}

const MODULE_STATUSES = ['draft', 'in_review', 'approved', 'published', 'archived'] as const;
export const moduleTransitionInput = z.object({ to: z.enum(MODULE_STATUSES) });

/** O trigger enforce_editorial_transition decide se a mudança vale (autor não aprova o próprio). */
export async function transitionModule(admin: CurrentUser, id: string, raw: unknown) {
  const { to } = moduleTransitionInput.parse(raw);
  return run(admin, async (tx) => {
    const [row] = await tx
      .update(s.modules)
      .set({ status: to })
      .where(eq(s.modules.id, id))
      .returning();
    if (!row) throw notFound('Módulo');
    await audit(tx, admin.id, `module.${to}`, { type: 'module', id }, { to });
    return row;
  });
}

// ── Instituições ──────────────────────────────────────────────────────────

export type InstitutionStatus = (typeof s.institutionStatus.enumValues)[number];

export async function listInstitutions(
  admin: CurrentUser,
  filter: { status?: InstitutionStatus; q?: string },
) {
  return withUser(db(), admin.id, (tx) =>
    tx
      .select({
        id: s.institutions.id,
        name: s.institutions.name,
        city: s.institutions.city,
        state: s.institutions.state,
        status: s.institutions.status,
        isDemo: s.institutions.isDemo,
        createdAt: s.institutions.createdAt,
        suggestedByEmail: s.authUsers.email,
        students: sql<number>`(select count(*)::int from student_profiles sp where sp.institution_id = "institutions"."id")`,
      })
      .from(s.institutions)
      .leftJoin(s.authUsers, eq(s.authUsers.id, s.institutions.suggestedBy))
      .where(
        and(
          filter.status ? eq(s.institutions.status, filter.status) : undefined,
          filter.q ? ilike(s.institutions.name, `%${filter.q}%`) : undefined,
        ),
      )
      .orderBy(
        sql`case ${s.institutions.status} when 'pending' then 0 when 'active' then 1 else 2 end`,
        asc(s.institutions.name),
      )
      .limit(300),
  );
}

export async function saveInstitution(admin: CurrentUser, id: string | null, raw: unknown) {
  const v = institutionInput.parse(raw);
  return run(admin, async (tx) => {
    if (id) {
      const [row] = await tx
        .update(s.institutions)
        .set(v)
        .where(eq(s.institutions.id, id))
        .returning();
      if (!row) throw notFound('Instituição');
      await audit(tx, admin.id, 'institution.updated', { type: 'institution', id }, v);
      return row;
    }
    const [row] = await tx
      .insert(s.institutions)
      .values({ ...v, status: 'active' })
      .returning();
    await audit(tx, admin.id, 'institution.created', { type: 'institution', id: row!.id }, v);
    return row!;
  });
}

export async function setInstitutionStatus(
  admin: CurrentUser,
  id: string,
  status: InstitutionStatus,
) {
  return run(admin, async (tx) => {
    const [row] = await tx
      .update(s.institutions)
      .set({ status })
      .where(eq(s.institutions.id, id))
      .returning();
    if (!row) throw notFound('Instituição');
    await audit(tx, admin.id, `institution.${status}`, { type: 'institution', id }, { status });
    return row;
  });
}

// ── Usuários ──────────────────────────────────────────────────────────────

export async function listUsers(admin: CurrentUser, filter: { q?: string; role?: Role }) {
  return withUser(db(), admin.id, (tx) =>
    tx
      .select({
        id: s.authUsers.id,
        name: s.authUsers.name,
        email: s.authUsers.email,
        emailVerified: s.authUsers.emailVerified,
        twoFactorEnabled: s.authUsers.twoFactorEnabled,
        createdAt: s.authUsers.createdAt,
        roles: sql<
          Role[]
        >`coalesce((select array_agg(r.role::text order by r.role) from role_assignments r where r.user_id = "auth_users"."id"), '{}')`,
        lastSeen: sql<Date | null>`(select max(se.updated_at) from auth_sessions se where se.user_id = "auth_users"."id")`,
      })
      .from(s.authUsers)
      .where(
        and(
          filter.q
            ? or(
                ilike(s.authUsers.email, `%${filter.q}%`),
                ilike(s.authUsers.name, `%${filter.q}%`),
              )
            : undefined,
          filter.role
            ? sql`exists (select 1 from role_assignments r where r.user_id = "auth_users"."id" and r.role = ${filter.role})`
            : undefined,
        ),
      )
      .orderBy(desc(s.authUsers.createdAt))
      .limit(200),
  );
}

export async function getUserAdmin(admin: CurrentUser, id: string) {
  return withUser(db(), admin.id, async (tx) => {
    const user = await tx.query.authUsers.findFirst({ where: eq(s.authUsers.id, id) });
    if (!user) throw notFound('Usuário');
    const roles = await tx
      .select({ role: s.roleAssignments.role, createdAt: s.roleAssignments.createdAt })
      .from(s.roleAssignments)
      .where(eq(s.roleAssignments.userId, id));
    const student = await tx
      .select({
        courseName: s.courses.name,
        institutionName: s.institutions.name,
        semester: s.studentProfiles.semester,
        onboardedAt: s.studentProfiles.onboardingCompletedAt,
      })
      .from(s.studentProfiles)
      .innerJoin(s.courses, eq(s.courses.id, s.studentProfiles.courseId))
      .leftJoin(s.institutions, eq(s.institutions.id, s.studentProfiles.institutionId))
      .where(eq(s.studentProfiles.userId, id))
      .then((r) => r[0] ?? null);
    const sessions = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(s.authSessions)
      .where(and(eq(s.authSessions.userId, id), sql`${s.authSessions.expiresAt} > now()`))
      .then((r) => r[0]?.n ?? 0);
    const history = await tx
      .select()
      .from(s.auditLogs)
      .where(and(eq(s.auditLogs.entityType, 'user'), eq(s.auditLogs.entityId, id)))
      .orderBy(desc(s.auditLogs.createdAt))
      .limit(20);
    return { user, roles: roles.map((r) => r.role as Role), student, sessions, history };
  });
}

export async function setRole(admin: CurrentUser, userId: string, role: Role, grant: boolean) {
  if (!ASSIGNABLE_ROLES.includes(role)) throw new ApiError(400, 'bad_request', 'Papel inválido.');
  if (!grant && role === 'admin' && userId === admin.id)
    throw new ApiError(409, 'conflict', 'Você não pode tirar o seu próprio acesso de admin.');
  return run(admin, async (tx) => {
    if (grant) {
      await tx
        .insert(s.roleAssignments)
        .values({ userId, role, grantedBy: admin.id })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(s.roleAssignments)
        .where(and(eq(s.roleAssignments.userId, userId), eq(s.roleAssignments.role, role)));
    }
    await audit(
      tx,
      admin.id,
      grant ? 'role.granted' : 'role.revoked',
      { type: 'user', id: userId },
      { role },
    );
  });
}

/** Sem e-mail transacional (Resend), o admin confirma o e-mail de quem ele conhece. */
export async function verifyEmail(admin: CurrentUser, userId: string) {
  return run(admin, async (tx) => {
    const [row] = await tx
      .update(s.authUsers)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(s.authUsers.id, userId))
      .returning({ id: s.authUsers.id });
    if (!row) throw notFound('Usuário');
    await audit(
      tx,
      admin.id,
      'user.email_verified',
      { type: 'user', id: userId },
      { source: 'admin' },
    );
  });
}

/** Encerra todas as sessões da pessoa (ex.: aparelho perdido). Ela entra de novo com a senha. */
export async function revokeSessions(admin: CurrentUser, userId: string) {
  return run(admin, async (tx) => {
    const rows = await tx
      .delete(s.authSessions)
      .where(eq(s.authSessions.userId, userId))
      .returning({ id: s.authSessions.id });
    await audit(
      tx,
      admin.id,
      'user.sessions_revoked',
      { type: 'user', id: userId },
      { count: rows.length },
    );
    return rows.length;
  });
}
