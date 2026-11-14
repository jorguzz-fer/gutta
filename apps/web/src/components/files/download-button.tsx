'use client';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ClientApiError } from '@/lib/client-api';

/** Baixa o original de um arquivo pela URL assinada de vida curta (DSC-04). */
export function DownloadButton({ fileId, label }: { fileId: string; label: string }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    setError('');
    try {
      const { url } = await api<{ url: string }>(
        `/files/${fileId}/url?variant=original&download=1`,
      );
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para baixar agora.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-2">
      <div>
        <Button type="button" onClick={go} disabled={busy}>
          <Download className="size-4" aria-hidden /> {label}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
