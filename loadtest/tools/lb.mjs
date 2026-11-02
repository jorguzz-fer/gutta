// Balanceador round-robin mínimo, só para simular N réplicas no teste de carga local.
// Em produção quem balanceia é o proxy do Coolify (Traefik). Uso: node lb.mjs 3300 3301 3302
import http from 'node:http';

const [port, ...targets] = process.argv.slice(2).map(Number);
let i = 0;
const agent = new http.Agent({ keepAlive: true, maxSockets: 512 });
http
  .createServer((req, res) => {
    const target = targets[i++ % targets.length];
    const up = http.request(
      { host: '127.0.0.1', port: target, method: req.method, path: req.url, headers: req.headers, agent },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    up.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  })
  .listen(port, () => console.log(`lb :${port} -> ${targets.join(', ')}`));
