import { randomUUID } from 'node:crypto';
import { createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import * as svc from './service';

// Disciplinas do aluno (SPEC v2, DIS-01 a DIS-03).
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);

async function user() {
  const id = randomUUID();
  await owner
    .insert(s.authUsers)
    .values({ id, name: 'Teste', email: `${id}@teste.gutta`, emailVerified: true });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'Teste' });
  return id;
}

async function file(ownerId: string, mime = 'application/pdf', sizeBytes = 1000) {
  const [f] = await owner
    .insert(s.files)
    .values({
      ownerId,
      originalName: 'cronograma.pdf',
      mime,
      sizeBytes,
      sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
    })
    .returning();
  return f!.id;
}

async function setFeatures(value: Record<string, boolean>) {
  await owner
    .insert(s.appSettings)
    .values({ key: 'features', value })
    .onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
  forget('flags:');
}

let ana: string;
let beto: string;

beforeAll(async () => {
  ana = await user();
  beto = await user();
  await setFeatures({ cadastro: true });
});
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('disciplinas', () => {
  it('cria no semestre atual (criado na primeira vez), com docentes sem repetir', async () => {
    const { discipline } = await svc.createDiscipline(ana, {
      name: 'Fisiopatologia',
      shortName: 'Fisiopato',
      color: 1,
      teachers: ['Dra. Juliana', 'dra. juliana', 'Dr. Felipe'],
    });
    expect(discipline).toMatchObject({ name: 'Fisiopatologia', shortName: 'Fisiopato', color: 1 });
    expect(discipline.teachers.map((t) => t.name)).toEqual(['Dra. Juliana', 'Dr. Felipe']);
    const terms = await owner.select().from(s.studentTerms).where(eq(s.studentTerms.ownerId, ana));
    expect(terms).toHaveLength(1);
    await svc.createDiscipline(ana, { name: 'Anatomia', shortName: null, color: 2, teachers: [] });
    expect((await svc.listDisciplines(ana)).items.map((d) => d.name)).toEqual([
      'Fisiopatologia',
      'Anatomia',
    ]);
    expect(
      await owner.select().from(s.studentTerms).where(eq(s.studentTerms.ownerId, ana)),
    ).toHaveLength(1);
  });

  it('nome repetido no semestre é conflito', async () => {
    await expect(
      svc.createDiscipline(ana, {
        name: 'fisiopatologia',
        shortName: null,
        color: 3,
        teachers: [],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('editar troca os docentes; remover arquiva', async () => {
    const { discipline } = await svc.createDiscipline(ana, {
      name: 'BMF',
      shortName: null,
      color: 4,
      teachers: ['A'.repeat(3)],
    });
    const { discipline: upd } = await svc.updateDiscipline(ana, discipline.id, {
      name: 'Biologia Molecular',
      shortName: 'BMF',
      color: 5,
      teachers: ['Prof. Kleber'],
    });
    expect(upd).toMatchObject({ name: 'Biologia Molecular', color: 5 });
    expect(upd.teachers.map((t) => t.name)).toEqual(['Prof. Kleber']);
    await svc.removeDiscipline(ana, discipline.id);
    expect((await svc.listDisciplines(ana)).items.some((d) => d.id === discipline.id)).toBe(false);
    const row = await owner.query.enrolledDisciplines.findFirst({
      where: eq(s.enrolledDisciplines.id, discipline.id),
    });
    expect(row?.archivedAt).not.toBeNull();
    // Arquivada, o nome volta a ficar livre.
    await svc.createDiscipline(ana, {
      name: 'Biologia Molecular',
      shortName: null,
      color: 6,
      teachers: [],
    });
  });

  it('liga cronograma e plano de ensino; recusa tipo e tamanho fora do aceito', async () => {
    const { discipline } = await svc.createDiscipline(ana, {
      name: 'MAD',
      shortName: null,
      color: 7,
      teachers: [],
    });
    const pdf = await file(ana);
    const first = await svc.attachDocument(ana, discipline.id, { kind: 'cronograma', fileId: pdf });
    const again = await svc.attachDocument(ana, discipline.id, { kind: 'cronograma', fileId: pdf });
    expect(again.discipline.documents).toHaveLength(1);
    expect(first.discipline.documents[0]).toMatchObject({ kind: 'cronograma', file: { id: pdf } });
    await expect(
      svc.attachDocument(ana, discipline.id, {
        kind: 'plano_ensino',
        fileId: await file(ana, 'image/png'),
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      svc.attachDocument(ana, discipline.id, {
        kind: 'plano_ensino',
        fileId: await file(ana, 'application/pdf', 11 * 1024 * 1024),
      }),
    ).rejects.toMatchObject({ status: 400 });
    const docId = first.discipline.documents[0]!.id;
    const after = await svc.detachDocument(ana, discipline.id, docId);
    expect(after.discipline.documents).toHaveLength(0);
  });
});

describe('isolamento', () => {
  it('outro aluno não vê, não edita, não remove e não usa arquivo alheio', async () => {
    const { discipline } = await svc.createDiscipline(ana, {
      name: 'Histologia',
      shortName: null,
      color: 8,
      teachers: [],
    });
    expect((await svc.listDisciplines(beto)).items).toHaveLength(0);
    await expect(
      svc.updateDiscipline(beto, discipline.id, {
        name: 'X1',
        shortName: null,
        color: 1,
        teachers: [],
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(svc.removeDiscipline(beto, discipline.id)).rejects.toMatchObject({ status: 404 });
    const { discipline: own } = await svc.createDiscipline(beto, {
      name: 'Bioquímica',
      shortName: null,
      color: 1,
      teachers: [],
    });
    await expect(
      svc.attachDocument(beto, own.id, { kind: 'cronograma', fileId: await file(ana) }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('com as chaves desligadas: feature_disabled', async () => {
    await setFeatures({});
    await expect(svc.listDisciplines(ana)).rejects.toMatchObject({ code: 'feature_disabled' });
    await setFeatures({ disciplinas: true });
    await expect(svc.listDisciplines(ana)).resolves.toBeTruthy();
    await setFeatures({ cadastro: true });
  });
});
