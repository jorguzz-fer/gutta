import { describe, expect, it } from 'vitest';
import { buildCsp, buildPieceCsp } from './csp';

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

  it('libera o bucket de arquivos para envio e miniaturas, só com https', () => {
    const csp = buildCsp({ storageEndpoint: 'https://conta.r2.cloudflarestorage.com/qualquer' });
    expect(csp).toContain("connect-src 'self' https://conta.r2.cloudflarestorage.com;");
    expect(csp).toContain("img-src 'self' data: blob: https://conta.r2.cloudflarestorage.com;");
    expect(buildCsp({ storageEndpoint: 'http://minio:9000' })).toContain("connect-src 'self';");
    expect(buildCsp({ storageEndpoint: 'http://localhost:9000', dev: true })).toContain(
      "connect-src 'self' http://localhost:9000;",
    );
    expect(buildCsp({ storageEndpoint: 'não é url' })).toContain("connect-src 'self';");
  });
});

describe('prévia das peças', () => {
  it('isola a peça: sandbox sem mesma origem, sem rede, emoldurada só pelo app', () => {
    const csp = buildPieceCsp({ storageEndpoint: 'https://bucket.r2.dev' });
    expect(csp).toContain('sandbox allow-scripts');
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('connect-src');
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain('media-src data: blob: https://bucket.r2.dev');
  });

  it('vídeo da peça: aceita o bucket e o próprio app, http só em ambiente local', () => {
    expect(
      buildPieceCsp({
        storageEndpoint: 'https://bucket.r2.dev',
        appUrl: 'https://app.cognuss.com.br',
      }),
    ).toContain('media-src data: blob: https://bucket.r2.dev https://app.cognuss.com.br;');
    expect(buildPieceCsp({ appUrl: 'http://localhost:3100' })).toContain(
      'media-src data: blob: http://localhost:3100;',
    );
    expect(buildPieceCsp({ appUrl: 'http://exemplo.com' })).toContain('media-src data: blob:;');
  });
});
