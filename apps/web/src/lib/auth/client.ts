'use client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// O redirecionamento para o segundo fator é tratado no formulário de login.
export const authClient = createAuthClient({ plugins: [twoFactorClient()] });
