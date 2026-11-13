'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Atalho Ctrl+K (ou Cmd+K) para a busca nos materiais (MAT-09). */
export function SearchShortcut() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        router.push('/app/busca');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);
  return null;
}
