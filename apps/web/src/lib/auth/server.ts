import 'server-only';
import { hashPassword, schema, verifyPassword, withUser } from '@gutta/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor } from 'better-auth/plugins';
import { db } from '../db';
import { env } from '../env';
import { logger } from '../logger';
import { mailer } from '../mail';
import { resetPasswordEmail, verificationEmail } from '../mail/templates';
import { redis } from '../redis';
import { redisRateLimitStorage } from './rate-limit-store';

// Configuração de autenticação (ADR 0002).
function createAuth() {
  const e = env();
  const redisClient = redis();
  return betterAuth({
    appName: 'Cognuss',
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    trustedOrigins: [e.APP_URL],
    database: drizzleAdapter(db(), {
      provider: 'pg',
      schema: {
        user: schema.authUsers,
        session: schema.authSessions,
        account: schema.authAccounts,
        verification: schema.authVerifications,
        twoFactor: schema.authTwoFactors,
      },
    }),
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      useSecureCookies: e.APP_URL.startsWith('https://'),
      cookiePrefix: 'gutta',
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Evita ir ao banco em toda requisição. Uma sessão revogada pode durar até 2 minutos.
      cookieCache: { enabled: true, maxAge: 120 },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      password: { hash: hashPassword, verify: verifyPassword },
      sendResetPassword: async ({ user, url }) => {
        const m = resetPasswordEmail(user.name, url);
        await mailer().send({ to: user.email, ...m });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        const m = verificationEmail(user.name, url);
        await mailer().send({ to: user.email, ...m });
      },
    },
    rateLimit: {
      enabled: e.AUTH_RATE_LIMIT ? e.AUTH_RATE_LIMIT === 'on' : e.NODE_ENV === 'production',
      // Com Redis, o limite vale para todas as réplicas juntas; sem ele, fica na memória.
      ...(redisClient ? { customStorage: redisRateLimitStorage(redisClient, logger) } : {}),
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 300, max: 5 },
        '/send-verification-email': { window: 300, max: 5 },
        '/two-factor/verify-totp': { window: 60, max: 10 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Todo usuário novo ganha um perfil. O papel de aluno é implícito (sem linha em role_assignments).
          after: async (user) => {
            await withUser(db(), user.id, (tx) =>
              tx
                .insert(schema.profiles)
                .values({ userId: user.id, displayName: user.name })
                .onConflictDoNothing(),
            );
            logger.info('auth.user_created', { userId: user.id });
          },
        },
      },
    },
    plugins: [
      // Aparelho confiável (opção marcada na tela do código): o 2FA não é pedido de novo neste
      // navegador por 12 horas. Cookie assinado e registro no banco, renovados a cada login.
      twoFactor({ issuer: 'Cognuss', trustDeviceMaxAge: 12 * 60 * 60 }),
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { __guttaAuth?: Auth };

export function auth(): Auth {
  if (!g.__guttaAuth) g.__guttaAuth = createAuth();
  return g.__guttaAuth;
}
