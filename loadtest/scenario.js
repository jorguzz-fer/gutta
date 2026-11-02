import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { journeys, publicPages, studentApis, studentPages } from './routes.js';

/*
  Teste de carga do Gutta (skill teste-de-carga). Nunca apontar para produção:
  BASE_URL precisa ser explícito e o script recusa *.tudomudou.com.br sem ALLOW_REMOTE=1.

  Degraus (PROFILE): smoke | carga | estresse | pico | resistencia | ci
*/
const BASE = __ENV.BASE_URL;
if (!BASE) throw new Error('Defina BASE_URL (ex.: http://localhost:3300)');
if (/tudomudou\.com\.br|gutta\.com/i.test(BASE) && __ENV.ALLOW_REMOTE !== '1') {
  throw new Error('BASE_URL parece produção. Teste de carga em produção só com autorização explícita.');
}
const PASSWORD = __ENV.LOAD_PASSWORD || 'carga-senha-2026';
const VUS = Number(__ENV.VUS || 100);
const PROFILE = __ENV.PROFILE || 'carga';
const users = new SharedArray('users', () => open('./data/users.csv').split('\n').slice(1).filter(Boolean));

const profiles = {
  smoke: { executor: 'constant-vus', vus: 2, duration: '1m' },
  carga: {
    executor: 'ramping-vus',
    stages: [
      { duration: '30s', target: Math.ceil(VUS * 0.1) },
      { duration: '1m', target: VUS },
      { duration: '3m', target: VUS },
      { duration: '30s', target: 0 },
    ],
  },
  estresse: {
    executor: 'ramping-vus',
    stages: [
      { duration: '1m', target: VUS },
      { duration: '1m', target: VUS * 2 },
      { duration: '1m', target: VUS * 3 },
      { duration: '1m', target: VUS * 4 },
      { duration: '30s', target: 0 },
    ],
  },
  pico: {
    executor: 'ramping-vus',
    stages: [
      { duration: '10s', target: VUS },
      { duration: '1m', target: VUS },
      { duration: '10s', target: 0 },
    ],
  },
  resistencia: { executor: 'constant-vus', vus: VUS, duration: __ENV.DURATION || '10m' },
  ci: { executor: 'ramping-vus', stages: [{ duration: '20s', target: VUS }, { duration: '1m40s', target: VUS }, { duration: '10s', target: 0 }] },
};

export const options = {
  scenarios: { [PROFILE]: profiles[PROFILE] },
  setupTimeout: '5m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    'http_req_duration{name:painel}': ['p(95)<1000'],
    'http_req_duration{name:proxima_questao}': ['p(95)<1000'],
    'http_req_duration{name:tentativa}': ['p(95)<1000'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const JSON_HEADERS = { 'content-type': 'application/json', origin: BASE };

// Login uma vez por usuário de teste; cada VU usa a sessão de um usuário.
export function setup() {
  const n = Math.min(users.length, Number(__ENV.LOGIN_USERS || Math.max(VUS * (PROFILE === 'estresse' ? 4 : 1), 2)));
  const sessions = [];
  for (let i = 0; i < n; i++) {
    const res = http.post(`${BASE}/api/auth/sign-in/email`, JSON.stringify({ email: users[i], password: PASSWORD }), {
      headers: JSON_HEADERS,
      tags: { name: 'setup_login' },
    });
    if (res.status !== 200) throw new Error(`login falhou para ${users[i]}: ${res.status} ${res.body}`);
    const c = {};
    for (const [k, v] of Object.entries(res.cookies)) c[k] = v[0].value;
    sessions.push(c);
  }
  return { sessions };
}

function pick() {
  const total = journeys.reduce((s, j) => s + j.weight, 0);
  let r = Math.random() * total;
  for (const j of journeys) {
    r -= j.weight;
    if (r <= 0) return j.name;
  }
  return journeys[0].name;
}

const ok = (res, name, extra = (r) => r.status < 400) => check(res, { [`${name} ok`]: extra });
const think = (min = 1, max = 3) => sleep(min + Math.random() * (max - min));

export default function (data) {
  const vu = exec.vu.idInTest;
  // O k6 limpa o cookie jar a cada iteração: a sessão do usuário é reaplicada sempre.
  const jar = http.cookieJar();
  const c = data.sessions[(vu - 1) % data.sessions.length];
  for (const [k, v] of Object.entries(c)) jar.set(BASE, k, v);
  const journey = pick();
  group(journey, () => {
    if (journey === 'painel') {
      ok(http.get(`${BASE}/app`, { tags: { name: 'painel' }, redirects: 0 }), 'painel', (r) => r.status === 200);
      think();
    } else if (journey === 'sessao_questoes') {
      const s = http.post(`${BASE}/api/v1/questions/sessions`, JSON.stringify({ mode: 'practice', count: 5 }), {
        headers: JSON_HEADERS,
        tags: { name: 'criar_sessao' },
      });
      if (!ok(s, 'criar_sessao')) return;
      const sessionId = s.json('sessionId');
      for (let i = 0; i < 5; i++) {
        const n = http.get(`${BASE}/api/v1/questions/sessions/${sessionId}/next`, { tags: { name: 'proxima_questao' } });
        ok(n, 'proxima_questao', (r) => r.status === 200 && !String(r.body).includes('isCorrect'));
        if (n.status !== 200 || n.json('done')) break;
        const opts = n.json('question.options');
        think(2, 6); // tempo de leitura da questão
        const a = http.post(
          `${BASE}/api/v1/questions/attempts`,
          JSON.stringify({
            sessionId,
            questionId: n.json('question.id'),
            selectedOptionId: opts[Math.floor(Math.random() * opts.length)].id,
            clientAttemptKey: `k6-${vu}-${exec.scenario.iterationInTest}-${i}-${Date.now()}`,
            durationSeconds: 20,
          }),
          { headers: JSON_HEADERS, tags: { name: 'tentativa' } },
        );
        ok(a, 'tentativa');
        think(1, 3); // lendo a explicação
      }
      ok(http.get(`${BASE}/api/v1/questions/sessions/${sessionId}`, { tags: { name: 'resumo_sessao' } }), 'resumo_sessao');
    } else if (journey === 'revisoes') {
      ok(http.get(`${BASE}/app/revisoes`, { tags: { name: 'pagina_revisoes' }, redirects: 0 }), 'pagina_revisoes', (r) => r.status === 200);
      const due = http.get(`${BASE}/api/v1/flashcards/due`, { tags: { name: 'fila_revisoes' } });
      ok(due, 'fila_revisoes');
      const cards = due.status === 200 ? due.json('cards') : [];
      for (const card of cards.slice(0, 3)) {
        think(2, 4);
        ok(
          http.post(
            `${BASE}/api/v1/flashcards/${card.id}/reviews`,
            JSON.stringify({ rating: 1 + Math.floor(Math.random() * 3), clientReviewKey: `k6-${vu}-${card.id}-${Date.now()}` }),
            { headers: JSON_HEADERS, tags: { name: 'avaliar_cartao' } },
          ),
          'avaliar_cartao',
        );
      }
    } else if (journey === 'navegacao') {
      const all = [...studentPages, ...studentApis];
      const path = all[Math.floor(Math.random() * all.length)];
      ok(http.get(`${BASE}${path}`, { tags: { name: path.replace(/\/[0-9a-f-]{36}/g, '/:id') }, redirects: 0 }), 'navegacao', (r) => r.status === 200);
      think();
    } else if (journey === 'publico') {
      const path = publicPages[Math.floor(Math.random() * publicPages.length)];
      ok(http.get(`${BASE}${path}`, { tags: { name: `publico ${path}` }, jar: new http.CookieJar() }), 'publico', (r) => r.status === 200);
      think();
    } else if (journey === 'exportacao') {
      ok(http.get(`${BASE}/api/v1/me/export`, { tags: { name: 'exportacao' } }), 'exportacao');
      think();
    } else if (journey === 'flashcard_novo') {
      ok(
        http.post(`${BASE}/api/v1/flashcards`, JSON.stringify({ front: `Cartão de carga ${Date.now()}`, back: 'verso' }), {
          headers: JSON_HEADERS,
          tags: { name: 'criar_cartao' },
        }),
        'criar_cartao',
      );
      think();
    }
  });
  think(1, 2);
}
