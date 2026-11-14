import { randomUUID } from 'node:crypto';
import { createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decryptPii } from '@/lib/pii';
import { finishSignup, loadSignup, savePersonal, saveProfile, saveRoutineStep } from './service';

// Cadastro da v2 (SPEC v2, CAD-01 a CAD-10).
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
    .values({ id, name: 'Ana Souza', email: `${id}@teste.gutta`, emailVerified: true });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'Ana' });
  return id;
}

// CPFs válidos gerados para o teste (não pertencem a ninguém de propósito).
function cpf(seed: number) {
  const base = String(100_000_000 + seed)
    .slice(-9)
    .split('')
    .map(Number);
  const dv = (arr: number[]) => {
    const sum = arr.reduce((acc, n, i) => acc + n * (arr.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return [...base, d1, d2].join('');
}
const seed = Math.floor(Math.random() * 800_000_000);

let medicina: string;
let outro: string;
let inst: string;

beforeAll(async () => {
  medicina = (await owner.query.courses.findFirst({ where: eq(s.courses.slug, 'medicina') }))!.id;
  outro = (await owner.query.courses.findFirst({
    where: eq(s.courses.slug, 'outro-curso-da-saude'),
  }))!.id;
  const i = await owner.query.institutions.findFirst({
    where: eq(s.institutions.status, 'active'),
  });
  inst = i!.id;
});
afterAll(async () => {
  await ownerPool.end();
});

describe('dados pessoais', () => {
  it('guarda o CPF cifrado, com resumo e só os dois últimos dígitos à vista', async () => {
    const u = await user();
    const c = cpf(seed);
    await savePersonal(u, {
      fullName: 'Ana Souza',
      cpf: c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
      phone: '(11) 98765-4321',
      terms: 'on',
    });
    const row = await owner.query.personalData.findFirst({ where: eq(s.personalData.userId, u) });
    expect(row!.cpfEncrypted).not.toContain(c);
    expect(decryptPii(row!.cpfEncrypted)).toBe(c);
    expect(row).toMatchObject({
      phone: '+5511987654321',
      cpfLast2: c.slice(-2),
      fullName: 'Ana Souza',
    });
    const view = await loadSignup(u);
    expect(view.personal.cpfMasked).toBe(`***.***.***-${c.slice(-2)}`);
    expect(JSON.stringify(view)).not.toContain(c);
    expect(view.next?.key).toBe('perfil');
    // Auditoria sem o número.
    const log = await owner.query.auditLogs.findFirst({ where: eq(s.auditLogs.entityId, u) });
    expect(JSON.stringify(log)).not.toContain(c);
  });

  it('um CPF, uma conta', async () => {
    const c = cpf(seed + 1);
    const a = await user();
    const b = await user();
    await savePersonal(a, { fullName: 'Ana Souza', cpf: c, phone: '11987654321', terms: 'on' });
    await expect(
      savePersonal(b, { fullName: 'Beto Lima', cpf: c, phone: '11987654322', terms: 'on' }),
    ).rejects.toMatchObject({ field: 'cpf', message: expect.stringMatching(/outra conta/) });
  });

  it('valida CPF, telefone, nome e termos', async () => {
    const u = await user();
    const ok = { fullName: 'Ana Souza', cpf: cpf(seed + 2), phone: '11987654321', terms: 'on' };
    await expect(savePersonal(u, { ...ok, cpf: '529.982.247-24' })).rejects.toMatchObject({
      field: 'cpf',
    });
    await expect(savePersonal(u, { ...ok, phone: '98765-4321' })).rejects.toMatchObject({
      field: 'phone',
    });
    await expect(savePersonal(u, { ...ok, terms: undefined })).rejects.toMatchObject({
      field: 'terms',
    });
    await expect(savePersonal(u, { ...ok, fullName: 'Ana' })).rejects.toThrow();
  });

  it('repetir o passo atualiza; CPF em branco mantém o salvo', async () => {
    const u = await user();
    const c = cpf(seed + 3);
    await savePersonal(u, { fullName: 'Ana Souza', cpf: c, phone: '11987654321', terms: 'on' });
    await savePersonal(u, { fullName: 'Ana Souza Lima', cpf: '', phone: '11912345678' });
    const row = await owner.query.personalData.findFirst({ where: eq(s.personalData.userId, u) });
    expect(row).toMatchObject({ fullName: 'Ana Souza Lima', phone: '+5511912345678' });
    expect(decryptPii(row!.cpfEncrypted)).toBe(c);
  });
});

describe('perfil acadêmico e fim do cadastro', () => {
  it('não pula os dados pessoais', async () => {
    const u = await user();
    await expect(
      saveProfile(u, {
        courseId: medicina,
        semester: 3,
        institutionId: inst,
        mainGoal: 'preparar_provas',
      }),
    ).rejects.toMatchObject({ field: 'form' });
  });

  it('qualquer curso da saúde, com "outro" pedindo o nome', async () => {
    const u = await user();
    await savePersonal(u, {
      fullName: 'Ana Souza',
      cpf: cpf(seed + 4),
      phone: '11987654321',
      terms: 'on',
    });
    await expect(
      saveProfile(u, {
        courseId: outro,
        semester: 2,
        institutionId: inst,
        mainGoal: 'organizar_rotina',
      }),
    ).rejects.toMatchObject({ field: 'courseOther' });
    await saveProfile(u, {
      courseId: outro,
      courseOther: 'Radiologia',
      semester: 2,
      institutionId: inst,
      campus: 'Centro',
      classGroup: 'XIIA',
      mainGoal: 'organizar_rotina',
    });
    // Repetir não duplica.
    await saveProfile(u, {
      courseId: outro,
      courseOther: 'Radiologia',
      semester: 3,
      institutionId: inst,
      mainGoal: 'organizar_rotina',
    });
    const p = await owner.query.studentProfiles.findFirst({
      where: eq(s.studentProfiles.userId, u),
    });
    expect(p).toMatchObject({
      courseOther: 'Radiologia',
      semester: 3,
      mainGoal: 'organizar_rotina',
    });
    // Falta o passo das disciplinas: não conclui ainda.
    expect((await loadSignup(u)).next?.key).toBe('disciplinas');
    expect(await finishSignup(u)).toBe(false);
    const [term] = await owner
      .insert(s.studentTerms)
      .values({ ownerId: u, label: '2026.2' })
      .returning();
    await owner
      .insert(s.enrolledDisciplines)
      .values({ ownerId: u, termId: term!.id, name: 'Anatomia' });
    // Rotina: segue sem exigir a meta de horas (CAD-05); repetir não muda nada.
    expect((await loadSignup(u)).next?.key).toBe('rotina');
    expect(await finishSignup(u)).toBe(false);
    await saveRoutineStep(u);
    await saveRoutineStep(u);
    expect((await loadSignup(u)).next).toBeNull();
    expect(await finishSignup(u)).toBe(true);
    const done = await owner.query.studentProfiles.findFirst({
      where: eq(s.studentProfiles.userId, u),
    });
    expect(done?.onboardingCompletedAt).not.toBeNull();
    // Concluir de novo não muda a data.
    await finishSignup(u);
    const again = await owner.query.studentProfiles.findFirst({
      where: eq(s.studentProfiles.userId, u),
    });
    expect(again?.onboardingCompletedAt?.getTime()).toBe(done?.onboardingCompletedAt?.getTime());
  });

  it('não conclui com passo faltando', async () => {
    const u = await user();
    expect(await finishSignup(u)).toBe(false);
  });
});

describe('isolamento', () => {
  it('outro aluno não lê os dados pessoais', async () => {
    const a = await user();
    const b = await user();
    await savePersonal(a, {
      fullName: 'Ana Souza',
      cpf: cpf(seed + 5),
      phone: '11987654321',
      terms: 'on',
    });
    const view = await loadSignup(b);
    expect(view.personal.cpfMasked).toBeNull();
    expect(view.personal.fullName).toBe('Ana Souza'); // o nome da conta do próprio b
  });
});
