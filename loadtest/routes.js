// Mapa de tráfego do teste de carga. Pesos = parcela esperada das jornadas no piloto.
// Regra (skill teste-de-carga): rota nova entra aqui no mesmo PR, ou vai para "fora do teste" no README.
export const journeys = [
  { name: 'painel', weight: 25 }, // GET /app (SSR com recomendação, questão do dia, semana)
  { name: 'sessao_questoes', weight: 30 }, // POST sessão → 5× (próxima + tentativa) → resumo
  { name: 'revisoes', weight: 15 }, // página de revisões + fila do dia + até 3 avaliações
  { name: 'navegacao', weight: 20 }, // demais páginas e listas do aluno
  { name: 'publico', weight: 8 }, // landing, entrar, cadastro, termos, health (sem login)
  { name: 'exportacao', weight: 1 }, // download dos dados (LGPD): raro e pesado
  { name: 'flashcard_novo', weight: 1 }, // criação de cartão pessoal
];

export const studentPages = [
  '/app/disciplinas',
  '/app/disciplinas/fisiopatologia-cardiovascular',
  '/app/disciplinas/fisiopatologia-cardiovascular/miocardiopatia-hipertrofica',
  '/app/disciplinas/fisiologia-cardiovascular',
  '/app/questoes',
  '/app/perfil',
  '/app/flashcards',
  '/app/privacidade',
];

export const studentApis = ['/api/v1/questions/sessions', '/api/v1/flashcards', '/api/v1/communication-preferences'];

export const publicPages = ['/', '/entrar', '/cadastro', '/termos', '/politica-de-privacidade', '/api/health'];
