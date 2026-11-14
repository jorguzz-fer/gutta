import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { toneIssues } from '@gutta/core';

/*
  Verificação automática do tom de voz (SPEC v2, 6.2 e 13): toda string e todo texto de JSX
  da interface passam pela lista de @gutta/core/tone. Comentários ficam de fora (eles podem
  citar a regra). Testes também, porque descrevem o que não se pode escrever.
*/
const ROOT = path.join(import.meta.dirname);
// O worker grava mensagens que o aluno lê (erro da leitura do cronograma, por exemplo).
const WORKER = path.join(ROOT, '../../worker/src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return [full];
  });
}

function texts(file: string): { text: string; line: number }[] {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: { text: string; line: number }[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      const text = node.text.trim();
      if (text)
        out.push({ text, line: src.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
    }
    node.forEachChild(visit);
  };
  visit(src);
  return out;
}

describe('tom de voz dos textos da interface', () => {
  it('nenhum texto com culpa, cobrança, fracasso ou leitura emocional', () => {
    const problems: string[] = [];
    for (const file of [...files(ROOT), ...files(WORKER)]) {
      for (const { text, line } of texts(file)) {
        for (const issue of toneIssues(text)) {
          problems.push(
            `${path.relative(ROOT, file)}:${line} "${issue.match}" (${issue.rule}): ${issue.hint}`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('a varredura enxerga JSX e strings (controle)', () => {
    const sample = path.join(ROOT, 'components', 'routine', 'routine-editor.tsx');
    const all = texts(sample).map((t) => t.text);
    expect(all).toContain('Resumo da sua rotina');
    expect(all.some((t) => t.includes('Toque numa célula vazia'))).toBe(true);
  });
});
