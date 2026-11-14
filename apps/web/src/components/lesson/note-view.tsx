'use client';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { parseNote, type Inline } from '@gutta/core';

/*
  Nota do caderno formatada (AUL-08; ADR 0015). O texto vira elementos React pelo analisador de
  packages/core; só a fórmula entra como HTML, gerado pelo KaTeX sem `trust`.
*/
function Math({ tex, block }: { tex: string; block?: boolean }) {
  const html = katex.renderToString(tex, {
    displayMode: Boolean(block),
    throwOnError: false,
    trust: false,
    strict: 'ignore',
    maxSize: 20,
    maxExpand: 200,
  });
  const Tag = block ? 'div' : 'span';
  return (
    <Tag
      className={block ? 'overflow-x-auto py-1' : undefined}
      // Saída do KaTeX com trust: false (sem links, sem estilos livres).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((x, i) =>
        x.type === 'bold' ? (
          <strong key={i}>{x.text}</strong>
        ) : x.type === 'math' ? (
          <Math key={i} tex={x.tex} />
        ) : (
          <span key={i} className="whitespace-pre-wrap">
            {x.text}
          </span>
        ),
      )}
    </>
  );
}

export function NoteView({ text }: { text: string }) {
  const blocks = parseNote(text);
  if (!blocks.length) return <p className="text-sm text-muted">Nota vazia.</p>;
  return (
    <div className="grid gap-2 text-[15px] leading-relaxed">
      {blocks.map((b, i) => {
        if (b.type === 'paragraph')
          return (
            <p key={i}>
              <Inlines items={b.content} />
            </p>
          );
        if (b.type === 'math') return <Math key={i} tex={b.tex} block />;
        if (b.type === 'list') {
          const List = b.ordered ? 'ol' : 'ul';
          return (
            <List key={i} className={b.ordered ? 'list-decimal pl-6' : 'list-disc pl-6'}>
              {b.items.map((it, k) => (
                <li key={k}>
                  <Inlines items={it} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <div key={i} className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              {b.header.length ? (
                <thead>
                  <tr>
                    {b.header.map((c, k) => (
                      <th key={k} scope="col" className="border border-line px-2 py-1 text-left">
                        <Inlines items={c} />
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {b.rows.map((r, k) => (
                  <tr key={k}>
                    {r.map((c, j) => (
                      <td key={j} className="border border-line px-2 py-1">
                        <Inlines items={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
