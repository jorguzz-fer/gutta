// Tipo do arquivo pelo conteúdo, não pela extensão nem pelo que o navegador disse (ADR 0012).

export type Kind = 'pdf' | 'office' | 'sheet' | 'image';
export type Detected = { family: 'pdf' | 'zip' | 'ole' | 'png' | 'jpeg' | 'webp' } | null;

export function sniff(buf: Buffer): Detected {
  const at = (sig: number[], offset = 0) => sig.every((b, i) => buf[offset + i] === b);
  if (at([0x25, 0x50, 0x44, 0x46, 0x2d])) return { family: 'pdf' }; // %PDF-
  if (at([0x50, 0x4b, 0x03, 0x04])) return { family: 'zip' }; // docx, pptx, xlsx, odt…
  if (at([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return { family: 'ole' }; // doc, ppt, xls
  if (at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { family: 'png' };
  if (at([0xff, 0xd8, 0xff])) return { family: 'jpeg' };
  if (at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8)) return { family: 'webp' };
  return null;
}

const SHEETS = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
]);
const ZIP_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',
]);
const OLE_TYPES = new Set([
  'application/msword',
  'application/vnd.ms-powerpoint',
  'application/vnd.ms-excel',
]);

/** Confere o tipo declarado contra o conteúdo. Devolve a família de processamento ou null. */
export function classify(declaredMime: string, buf: Buffer): Kind | null {
  const d = sniff(buf);
  if (!d) return null;
  switch (d.family) {
    case 'pdf':
      return declaredMime === 'application/pdf' ? 'pdf' : null;
    case 'png':
      return declaredMime === 'image/png' ? 'image' : null;
    case 'jpeg':
      return declaredMime === 'image/jpeg' ? 'image' : null;
    case 'webp':
      return declaredMime === 'image/webp' ? 'image' : null;
    case 'zip':
      if (!ZIP_TYPES.has(declaredMime)) return null;
      return SHEETS.has(declaredMime) ? 'sheet' : 'office';
    case 'ole':
      if (!OLE_TYPES.has(declaredMime)) return null;
      return SHEETS.has(declaredMime) ? 'sheet' : 'office';
  }
}
