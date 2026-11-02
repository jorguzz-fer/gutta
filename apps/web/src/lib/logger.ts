// Log estruturado em JSON (uma linha por evento). Nunca registrar senha, token ou conteúdo do aluno.
type Fields = Record<string, unknown>;
const REDACT = /pass|token|secret|authorization|cookie/i;

function clean(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) out[k] = REDACT.test(k) ? '[omitido]' : v;
  return out;
}

function write(level: 'info' | 'warn' | 'error', event: string, fields: Fields = {}) {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...clean(fields) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (process.env.NODE_ENV !== 'test') console.log(line);
}

export const logger = {
  info: (event: string, fields?: Fields) => write('info', event, fields),
  warn: (event: string, fields?: Fields) => write('warn', event, fields),
  error: (event: string, fields?: Fields) => write('error', event, fields),
};
