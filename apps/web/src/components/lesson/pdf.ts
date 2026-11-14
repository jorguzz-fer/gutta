'use client';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// Carrega o pdf.js só na tela da aula (ADR 0015), com o worker do próprio app.
let ready: Promise<typeof import('pdfjs-dist')> | null = null;

function lib() {
  ready ??= import('pdfjs-dist').then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      // O worker do pacote é um arquivo só, sem importações: o build copia como está e o
      // app serve do próprio domínio (a CSP só aceita scripts de 'self').
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(
        new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
        { type: 'module' },
      );
    }
    return pdfjs;
  });
  return ready;
}

/** Abre o PDF; `close` encerra o carregamento e libera a memória do documento. */
export async function openPdf(url: string): Promise<{ doc: PDFDocumentProxy; close: () => void }> {
  const pdfjs = await lib();
  const task = pdfjs.getDocument({
    url,
    // Sem WebAssembly: a CSP não precisa de 'wasm-unsafe-eval'.
    useWasm: false,
    disableWorkerRendering: true,
  });
  return { doc: await task.promise, close: () => void task.destroy() };
}

export type { PDFDocumentProxy };
