"""Gera docs/carga/relatorio.html a partir dos resultados do k6 (loadtest/resultados/*.json).

Uso: python3 loadtest/tools/report.py
"""
import collections
import datetime
import html
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
RES = ROOT / 'loadtest' / 'resultados'
OUT = ROOT / 'docs' / 'carga' / 'relatorio.html'

LABEL = {
    'painel': 'Painel /app',
    'criar_sessao': 'Criar sessão de questões',
    'proxima_questao': 'Próxima questão',
    'tentativa': 'Responder questão',
    'resumo_sessao': 'Resumo da sessão',
    'pagina_revisoes': 'Página de revisões',
    'fila_revisoes': 'Fila de revisões (API)',
    'avaliar_cartao': 'Avaliar cartão',
    'exportacao': 'Exportar dados (LGPD)',
    'criar_cartao': 'Criar cartão pessoal',
}


def pct(v, p):
    if not v:
        return None
    v = sorted(v)
    return v[max(0, int(round(len(v) * p)) - 1)]


def per_route(raw):
    dur = collections.defaultdict(list)
    fail = collections.Counter()
    total = collections.Counter()
    for line in open(raw):
        d = json.loads(line)
        if d.get('type') != 'Point':
            continue
        name = d['data']['tags'].get('name', '?')
        if name == 'setup_login':
            continue
        if d['metric'] == 'http_req_duration':
            dur[name].append(d['data']['value'])
        elif d['metric'] == 'http_req_failed':
            total[name] += 1
            fail[name] += int(d['data']['value'])
    rows = []
    for name, v in dur.items():
        label = LABEL.get(name, name)
        if name.startswith('publico '):
            label = 'Público ' + name.split(' ', 1)[1]
        rows.append(
            {
                'name': label,
                'n': len(v),
                'p50': pct(v, 0.5),
                'p95': pct(v, 0.95),
                'p99': pct(v, 0.99),
                'err': fail[name] / total[name] if total[name] else 0,
            }
        )
    rows.sort(key=lambda r: -r['n'])
    return rows


def summary(path):
    d = json.load(open(path))['metrics']
    dur = d['http_req_duration']
    return {
        'p95': dur.get('p(95)'),
        'avg': dur.get('avg'),
        'err': d['http_req_failed'].get('value', d['http_req_failed'].get('rate', 0)),
        'reqs': d['http_reqs']['count'],
        'checks': d['checks'].get('value', d['checks'].get('rate')),
        'painel': d.get('http_req_duration{name:painel}', {}).get('p(95)'),
    }


def series(raw):
    by = collections.defaultdict(list)
    vus = {}
    t0 = None
    for line in open(raw):
        d = json.loads(line)
        if d.get('type') != 'Point' or d['metric'] not in ('http_req_duration', 'vus'):
            continue
        if d['data']['tags'].get('name') == 'setup_login':
            continue
        ts = datetime.datetime.fromisoformat(d['data']['time'][:19])
        t0 = t0 or ts
        b = int((ts - t0).total_seconds() // 10) * 10
        if d['metric'] == 'vus':
            vus[b] = d['data']['value']
        else:
            by[b].append(d['data']['value'])
    out = []
    for b in sorted(set(by) | set(vus)):
        p95 = pct(by.get(b, []), 0.95)
        out.append({'t': b, 'vus': vus.get(b, 0), 'p95': round(p95) if p95 else None, 'rps': round(len(by.get(b, [])) / 10, 1)})
    return out


def num(n):
    return f'{n:,}'.replace(',', '.')


def pc(v):
    return f'{v * 100:.2f}%'.replace('.', ',')


def ms(v):
    if v is None:
        return '—'
    return f'{v / 1000:.2f} s'.replace('.', ',') if v >= 1000 else f'{round(v)} ms'


def main():
    carga = summary(RES / 'carga-final.json')
    stress = summary(RES / 'estresse-final.json')
    stress2 = summary(RES / 'estresse-2replicas.json')
    pico = summary(RES / 'pico-final.json')
    soak = summary(RES / 'resistencia.json')
    smoke = summary(RES / 'smoke.json')
    routes = per_route(RES / 'carga-final-raw.json')
    s = series(RES / 'estresse-final-raw.json')
    before_after = [
        ('Antes', summary(RES / 'pico.json')['painel']),
        ('1 transação de acesso', summary(RES / 'pico-depois.json')['painel']),
        ('Contagens no SQL', summary(RES / 'pico-depois2.json')['painel']),
        ('Catálogo em cache', pico['painel']),
    ]
    data = {'series': s, 'beforeAfter': before_after}

    rows_html = '\n'.join(
        f"<tr><td>{html.escape(r['name'])}</td><td>{num(r['n'])}</td><td>{ms(r['p50'])}</td>"
        f"<td>{ms(r['p95'])}</td><td>{ms(r['p99'])}</td><td>{pc(r['err'])}</td>"
        f"<td><span class=\"pill {'ok' if (r['p95'] or 0) < 1000 and r['err'] < 0.01 else 'bad'}\">"
        f"{'passou' if (r['p95'] or 0) < 1000 and r['err'] < 0.01 else 'falhou'}</span></td></tr>"
        for r in routes
    )
    steps = [
        ('Smoke', '2', smoke),
        ('Carga', '100', carga),
        ('Pico', '0 → 200 em 10 s', pico),
        ('Resistência (10 min)', '100', soak),
        ('Estresse, 1 réplica', '100 → 400', stress),
        ('Estresse, 2 réplicas', '100 → 400', stress2),
    ]
    steps_html = '\n'.join(
        f"<tr><td>{n}</td><td>{v}</td><td>{ms(x['p95'])}</td><td>{ms(x['painel'])}</td>"
        f"<td>{pc(x['err'])}</td><td>{num(x['reqs'])}</td>"
        f"<td><span class=\"pill {'ok' if x['p95'] < 1000 and x['err'] < 0.01 else 'bad'}\">"
        f"{'dentro do SLA' if x['p95'] < 1000 and x['err'] < 0.01 else 'fora do SLA'}</span></td></tr>"
        for n, v, x in steps
    )
    tpl = (ROOT / 'loadtest' / 'tools' / 'report-template.html').read_text()
    out = (
        tpl.replace('__DATA__', json.dumps(data))
        .replace('__ROUTES__', rows_html)
        .replace('__STEPS__', steps_html)
        .replace('__CARGA_P95__', ms(carga['p95']))
        .replace('__PICO_P95__', ms(pico['p95']))
        .replace('__SOAK_P95__', ms(soak['p95']))
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(out)
    print(f'relatório em {OUT}')


if __name__ == '__main__':
    main()
