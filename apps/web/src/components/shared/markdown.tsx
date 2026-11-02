// Markdown mínimo e seguro para resumos editoriais: títulos, listas, citações, parágrafos,
// **negrito** e *itálico*. Gera elementos React; nunca injeta HTML (sem risco de XSS).
import { Fragment } from 'react';

function inline(text: string, keyBase: string) {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(
      tok.startsWith('**') ? (
        <strong key={`${keyBase}-${i++}`}>{tok.slice(2, -2)}</strong>
      ) : (
        <em key={`${keyBase}-${i++}`}>{tok.slice(1, -1)}</em>
      ),
    );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let list: string[] = [];
  let para: string[] = [];
  const flush = (k: number) => {
    if (para.length) {
      blocks.push(<p key={`p${k}`}>{inline(para.join(' '), `p${k}`)}</p>);
      para = [];
    }
    if (list.length) {
      blocks.push(
        <ul key={`u${k}`} className="ml-5 list-disc space-y-1">
          {list.map((li, j) => (
            <li key={j}>{inline(li, `u${k}-${j}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((raw, k) => {
    const line = raw.trimEnd();
    if (!line.trim()) return flush(k);
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      flush(k);
      const Tag = h[1]!.length === 2 ? 'h2' : 'h3';
      blocks.push(
        <Tag
          key={`h${k}`}
          className={Tag === 'h2' ? 'mt-4 text-xl font-bold' : 'mt-3 text-lg font-bold'}
        >
          {inline(h[2]!, `h${k}`)}
        </Tag>,
      );
      return;
    }
    if (line.startsWith('> ')) {
      flush(k);
      blocks.push(
        <blockquote key={`q${k}`} className="border-l-4 border-warn bg-warn-soft px-3 py-2 text-sm">
          {inline(line.slice(2), `q${k}`)}
        </blockquote>,
      );
      return;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      if (para.length) flush(k);
      list.push(li[1]!);
      return;
    }
    if (list.length) flush(k);
    para.push(line.trim());
  });
  flush(lines.length);
  return (
    <div className="grid gap-3 leading-relaxed">
      {blocks.map((b, i) => (
        <Fragment key={i}>{b}</Fragment>
      ))}
    </div>
  );
}
