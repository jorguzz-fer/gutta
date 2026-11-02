import { describe, expect, it } from 'vitest';
import { buildCsp } from './csp';

describe('CSP', () => {
  it('inclui só origens https válidas no frame-src', () => {
    const csp = buildCsp({
      lessonOrigins:
        'https://aula.alumine.com.br http://inseguro.com javascript:alert(1) https://lab.tudomudou.com.br',
    });
    expect(csp).toContain(
      "frame-src 'self' https://aula.alumine.com.br https://lab.tudomudou.com.br;",
    );
    expect(csp).not.toContain('inseguro');
    expect(csp).not.toContain('javascript');
  });
  it('sem origens, só o próprio app', () => {
    expect(buildCsp({})).toContain("frame-src 'self';");
    expect(buildCsp({})).toContain("frame-ancestors 'none'");
    expect(buildCsp({})).not.toContain('unsafe-eval');
  });
});
