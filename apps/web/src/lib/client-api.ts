'use client';

// Cliente das rotas /api/v1. Erros chegam no formato { code, message, requestId }.
export class ClientApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
      cache: 'no-store',
    });
  } catch {
    throw new ClientApiError(0, 'network', 'Sem conexão. Confira a internet e tente de novo.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ClientApiError(
      res.status,
      data.code ?? 'error',
      data.message ?? 'Algo deu errado.',
      data.requestId,
    );
  }
  return data as T;
}
