import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createDb, createPool, eq, schema as s } from '@gutta/db';
import { expect, type Page } from '@playwright/test';
import { E2E_OWNER_DB, OUTBOX } from '../playwright.config';

export const PASSWORD = 'senha-e2e-segura-1';

let pool: ReturnType<typeof createPool> | undefined;
/** Acesso de dono ao banco, só para preparar cenário (promover papel). Nunca para afirmar comportamento. */
export function ownerDb() {
  pool ??= createPool(E2E_OWNER_DB, 2);
  return createDb(pool);
}

export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${randomUUID().slice(0, 6)}@gutta.test`;
}

/** Link do último e-mail enviado para `to` (o MailProvider de log grava no arquivo). */
export async function lastMailLink(to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    if (existsSync(OUTBOX)) {
      const mails = readFileSync(OUTBOX, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      const m = mails.reverse().find((x: { to: string }) => x.to === to);
      if (m) return (m.text as string).match(/https?:\/\/\S+/)![0];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Nenhum e-mail para ${to}`);
}

export async function signUp(page: Page, name: string, email: string) {
  await page.goto('/cadastro');
  await page.getByLabel('Como quer ser chamado(a)').fill(name);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox', { name: /termos de uso/ }).check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada. Confira seu e-mail.')).toBeVisible();
  await page.goto(await lastMailLink(email));
}

export async function signIn(page: Page, email: string, password = PASSWORD, next = '/app') {
  await page.goto(`/entrar?next=${encodeURIComponent(next)}`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(
    (u) => !u.pathname.startsWith('/entrar') || u.pathname.startsWith('/entrar/dois-fatores'),
  );
}

export async function completeOnboarding(page: Page, disciplineName = 'Fisiologia cardiovascular') {
  await expect(page).toHaveURL(/\/onboarding/);
  // Com mais de um curso ativo (o E2E do admin cria cursos), o aluno escolhe Medicina.
  const course = page.getByLabel('Curso', { exact: true });
  if (await course.isVisible()) await course.selectOption({ label: 'Medicina' });
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Semestre atual').selectOption('2');
  await page
    .locator('label', { hasText: disciplineName })
    .filter({ has: page.locator('input[name=disciplineIds]') })
    .click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Começar a estudar' }).click();
  await page.waitForURL((u) => u.pathname === '/app');
}

export async function promote(email: string, role: (typeof s.appRole.enumValues)[number]) {
  const db = ownerDb();
  const u = await db.query.authUsers.findFirst({ where: eq(s.authUsers.email, email) });
  await db.insert(s.roleAssignments).values({ userId: u!.id, role }).onConflictDoNothing();
}

function base32(secret: string) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase())
    bits += a.indexOf(c).toString(2).padStart(5, '0');
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

/** TOTP (RFC 6238, SHA-1, 30 s, 6 dígitos), o mesmo que um app autenticador geraria. */
export function totp(secret: string, at = Date.now()) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', base32(secret)).update(buf).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Conta nova promovida a admin, com o segundo fator ativado (exigido para admin). */
export async function becomeAdmin(page: Page, name = 'Carla Admin') {
  const email = uniqueEmail('adm-crud');
  await signUp(page, name, email);
  await promote(email, 'admin');
  await page.goto('/admin/cursos');
  await expect(page).toHaveURL(/\/seguranca\/dois-fatores/);
  await page.getByLabel('Confirme sua senha').fill('senha-e2e-segura-1');
  await page.getByRole('button', { name: 'Continuar' }).click();
  const secret = (await page.locator('code').innerText()).trim();
  await page.getByLabel('Código de 6 dígitos do app').fill(totp(secret));
  await page.getByRole('button', { name: 'Ativar', exact: true }).click();
  await expect(page.getByText('Verificação em duas etapas ativa.')).toBeVisible();
  return email;
}
