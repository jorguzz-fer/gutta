import { describe, expect, it } from 'vitest';
import { classify, sniff } from '../src/files/detect';

const PDF = Buffer.from('%PDF-1.7\n');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('tipo pelo conteúdo', () => {
  it('reconhece as assinaturas', () => {
    expect(sniff(PDF)).toEqual({ family: 'pdf' });
    expect(sniff(ZIP)).toEqual({ family: 'zip' });
    expect(sniff(OLE)).toEqual({ family: 'ole' });
    expect(sniff(PNG)).toEqual({ family: 'png' });
    expect(sniff(Buffer.from('<html>'))).toBeNull();
  });

  it('aceita quando o declarado bate com o conteúdo', () => {
    expect(classify('application/pdf', PDF)).toBe('pdf');
    expect(classify(DOCX, ZIP)).toBe('office');
    expect(classify(XLSX, ZIP)).toBe('sheet');
    expect(classify('application/vnd.ms-powerpoint', OLE)).toBe('office');
    expect(classify('image/png', PNG)).toBe('image');
  });

  it('recusa quando não bate', () => {
    expect(classify('application/pdf', PNG)).toBeNull();
    expect(classify(DOCX, PDF)).toBeNull();
    expect(classify('image/jpeg', PNG)).toBeNull();
    expect(classify('application/pdf', Buffer.from('<script>'))).toBeNull();
  });
});
