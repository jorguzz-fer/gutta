'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';

export function SignOutButton({ everywhere = false }: { everywhere?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function onClick() {
    setPending(true);
    if (everywhere) await authClient.revokeSessions();
    await authClient.signOut();
    router.replace('/entrar');
    router.refresh();
  }
  return (
    <Button variant={everywhere ? 'danger' : 'ghost'} onClick={onClick} loading={pending}>
      {everywhere ? 'Sair de todos os aparelhos' : 'Sair'}
    </Button>
  );
}
