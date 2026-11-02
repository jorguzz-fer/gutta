# SPEC DE PRODUTO E ENGENHARIA — Plataforma Integrada para Estudantes da Saúde

**Versão:** 1.0 — 02/11/2026  
**Status:** Especificação proposta para desenvolvimento; decisões pendentes identificadas  
**Documento de origem:** *Plataforma Integrada para Alunos de Graduação nas Áreas da Saúde — Documento de Conceito e Proposta de Valor*, outubro/2026  
**Nome de trabalho:** `CampusSaude` (placeholder técnico; **não é definição de marca**)  
**Objetivo deste documento:** servir como fonte de verdade para planejamento, arquitetura, construção, testes e evolução do produto com Claude Code.

> **Critério de leitura:** a visão de produto e seus quatro ambientes vêm do documento de conceito. Priorização, fluxos, parâmetros, arquitetura, modelos de dados e critérios de aceite abaixo são **propostas de especificação** para tornar o projeto executável. Nenhuma escolha técnica ou comercial proposta deve ser confundida com uma decisão já aprovada.

---

## 1. Resumo executivo

### 1.1 Visão
Criar um **ecossistema de aprendizagem contínua para estudantes de graduação da área da saúde**, que reúna estudo ativo, banco adaptativo de questões, flashcards, tutor de inteligência artificial, conteúdos, comunidade, professores, oportunidades acadêmicas e identidade digital.

**Promessa de valor:** ao entrar, o estudante já encontra o próximo passo de estudo mais útil para seu **curso, instituição, semestre, disciplinas, dificuldades e próximas provas**. O produto deve tornar-se um hábito diário — não apenas uma biblioteca de conteúdos.

### 1.2 Objetivos do negócio
1. Adquirir estudantes com utilidade gratuita recorrente.
2. Melhorar aprendizagem percebida e retenção por meio de personalização fundamentada em dados de uso.
3. Monetizar funcionalidades premium, aulas e cursos; futuramente vender licenças institucionais e capturar comissões do marketplace.
4. Desenvolver distribuição e vínculo com uma identidade acadêmica própria, respeitando privacidade e consentimentos.
5. Construir uma base tecnológica expansível para diversos cursos, sem exigir implementação de todos desde o início.

### 1.3 Princípios de produto
- **Estudar antes de consumir:** questão, revisão e feedback têm prioridade sobre feed e catálogo.
- **Personalização verificável:** explicar por que determinada questão ou revisão foi indicada.
- **IA ancorada em evidência:** preferir conteúdo revisado, fontes atribuídas e reconhecimento explícito de incerteza.
- **Conteúdo de saúde com revisão:** separar material editorial validado de respostas ou materiais gerados por usuários/IA.
- **Arquitetura evolutiva:** monólito modular no início; evitar microserviços prematuros.
- **Privacidade desde o início:** só coletar o indispensável e dar controle sobre uso de dados.

### 1.4 Métrica norteadora (proposta)
**Estudantes semanalmente engajados em aprendizagem ativa (WALS):** estudantes únicos que, na semana, concluíram ao menos uma atividade significativa — responder questões, finalizar revisão de flashcards, concluir simulado ou uma sessão de aprendizagem com evidência de uso — excluindo login e navegação passiva.

Indicadores complementares: ativação no primeiro dia; retenção D7/D30; dias ativos por semana; questões concluídas; taxa de revisão no prazo; evolução do domínio dos assuntos; satisfação com tutor IA; conversão gratuita → paga; margem por usuário ativo.

---

## 2. Escopo, público e estratégia de lançamento

### 2.1 Público abrangido na visão
Medicina, Medicina Veterinária, Enfermagem, Odontologia, Biomedicina, Farmácia, Fisioterapia, Nutrição, Educação Física e outros cursos da saúde.

### 2.2 Público de lançamento — recomendação
- **Piloto:** estudantes do **Ciclo Básico**, começando por **um curso prioritário** e um conjunto limitado de disciplinas e instituições parceiras.
- **Recomendação inicial para validação:** Medicina, por ter grande amplitude de temas e aderência a questões, flashcards e tutoria. **Alternativa:** selecionar outro curso caso já exista distribuição/parceria com uma instituição; a escolha final é uma decisão de negócio.
- **Importante:** arquitetura deve suportar muitos cursos, mas o conteúdo inicial só deve existir para as disciplinas efetivamente curadas.
- Instituições de ensino são atributos de personalização; contratos e recursos institucionais completos ficam para fases posteriores.

### 2.3 Não objetivos do MVP
Não construir na primeira versão: streaming próprio complexo, videoconferência própria, marketplace transacional com repasses, laboratórios 3D/AR/VR, simuladores de OSCE completos, prontuário, atendimento a pacientes, prescrição real, integração profunda com sistemas universitários, rede alumni completa nem caixa postal de e-mail de propósito geral.

### 2.4 Premissas de mercado
O documento de origem apresenta números de matrículas de **anos diferentes** e uma projeção ilustrativa de 1% × R$ 50. Tratá-los como **hipóteses exploratórias, não como TAM/SAM/SOM validado, preço aprovado ou projeção de receita recorrente**. Fazer validação independente antes de apresentá-los a investidores ou utilizá-los no orçamento.

---

## 3. Perfis e permissões

| Perfil | Escopo e capacidade | Disponibilidade |
|---|---|---|
| **Aluno** | Cadastro, plano de estudo, questões, tutor IA, flashcards, biblioteca, comunidade, identidade digital, preferências | MVP |
| **Curador/editor** | Criar, revisar, publicar e versionar disciplinas, resumos, questões e explicações; revisar conteúdo de IA | MVP |
| **Administrador** | Acessos, catálogo, relatórios, planos, limites de IA, moderação, configurações e auditoria | MVP |
| **Moderador** | Denúncias, ocultação de postagens e aplicação das políticas comunitárias | MVP enxuto |
| **Professor** | Perfil verificado, cursos, aulas, monitorias, materiais e disponibilidade | Fase 2 |
| **Gestor institucional** | Turmas, licenças, avaliações e indicadores agregados sem exposição indevida de alunos | Fase 3 |
| **Suporte** | Atendimento e resolução, com acesso mínimo e rastreado aos dados | MVP enxuto |

**RBAC:** toda operação deve validar autorização no servidor e, quando aplicável, por Row Level Security (RLS). Front-end não é barreira de segurança. Uma pessoa pode possuir múltiplos papéis explicitamente concedidos.

---

## 4. Arquitetura funcional: quatro ambientes integrados

### 4.1 Ambiente do Aluno — MVP
Experiência principal de acesso diário: dashboard, disciplinas, metas, questões, revisão espaçada, tutor IA contextual, biblioteca, perfil e identidade digital, comunidades moderadas.

### 4.2 Ambiente do Professor — Fase 2
Perfil profissional, verificação e credenciais, criação/publicação de conteúdos, cursos, sessões individuais, agenda, vendas e ganhos.

### 4.3 Ambiente Institucional — Fase 3
Gestão de grupos e turmas, trilhas e avaliações, licenças por aluno, relatórios agregados, integrações acadêmicas SSO/API.

### 4.4 Marketplace — Fases 2–4
Cursos e monitorias inicialmente; depois eventos, congressos, livros, produtos, serviços, publicidade e benefícios. O marketplace deverá ter políticas de qualidade, comissão, cancelamento e reembolso.

**Regra de implementação:** não construir os quatro ambientes completos ao mesmo tempo. Manter fronteiras conceituais e rotas separadas; entregar **Aluno + administração editorial** primeiro.

---

## 5. Matriz de funcionalidades e prioridades

Classificação: **P0 = indispensável ao MVP**; **P1 = primeira expansão**; **P2 = evolução**.

| ID | Funcionalidade | Prioridade | Observação |
|---|---|---|---|
| AUTH-01 | Autenticação, recuperação de acesso e perfis | P0 | Sessões seguras; verificação de e-mail |
| ONB-01 | Onboarding por curso, instituição, período, disciplinas e objetivos | P0 | Campos alteráveis depois |
| CAT-01 | Catálogo hierárquico de cursos → currículos/disciplinas → assuntos | P0 | Conteúdo por curso e versão |
| HOME-01 | Dashboard “o que estudar hoje” | P0 | Questão do dia + pendências + progresso |
| QUE-01 | Questões com explicação e referências | P0 | Disciplina, tema, dificuldade e publicação revisada |
| QUE-02 | Diagnóstico inicial e recomendações adaptativas | P0 | Algoritmo simples, observável e testável |
| FC-01 | Flashcards e revisão espaçada | P0 | Algoritmo inicial documentado |
| LIB-01 | Biblioteca de resumos e materiais curados | P0 | Busca/filtros; controle de direito autoral |
| AI-01 | Tutor IA contextual com histórico e fontes | P0 | Guardrails de uso educacional e custo |
| ADM-01 | Administração editorial de conteúdos e usuários | P0 | Workflow rascunho → revisão → publicação |
| COM-01 | Comunidades mínimas por curso/disciplina | P0 simplificado | Post, comentário, denúncia e moderação |
| ID-01 | Identidade digital exclusiva no domínio | P0 por etapas | Reservar identificador; e-mail externo depende de provedor |
| NOT-01 | Notificações internas e preferências | P0 | E-mail transacional para conta pessoal verificada |
| ANA-01 | Eventos de produto e indicadores | P0 | Instrumentar desde o primeiro lançamento |
| PAY-01 | Plano gratuito/premium e limites | P0 (controle de acesso) | Cobrança real pode entrar na etapa de monetização |
| VID-01 | Videoaulas, trilhas e cursos | P1 | Streaming de provedor externo |
| SIM-01 | Simulados e relatórios por prova | P1 | Banco de questões reutilizado |
| PROF-01 | Marketplace e agendamento de professores | P1 | Intermediação e regras financeiras |
| ID-02 | Caixa postal completa no domínio | P1/P2 | Fornecedor especializado, antispam e suporte |
| ATL-01 | Atlas interativo | P1/P2 | Direitos de imagens/recursos |
| CAR-01 | Portfólio, estágios, iniciação científica, ligas, carreira | P2 | Curadoria e verificação de oportunidades |
| INST-01 | Painéis e licenças institucionais | P2 | Agregação de dados e tenancy |
| CLIN-01 | Casos clínicos, pacientes virtuais, OSCE | P2 | Revisão profissional e dados sintéticos |
| IMM-01 | Modo offline, acessibilidade avançada, gamificação | Contínuo | Acessibilidade básica é P0 |
| XR-01 | Microscopia avançada, atlas 3D, AR/VR | P2+ | Não bloquear MVP |

---

## 6. Especificação funcional do MVP

### 6.1 AUTH-01 — Cadastro e autenticação
**Entrada:** e-mail pessoal, senha ou login social habilitado, aceite de termos e política de privacidade.  
**Comportamento:** criar usuário; enviar confirmação; permitir recuperação, logout de todas as sessões; impedir acesso a recursos restritos sem sessão válida.  
**Critérios de aceite:**
- Visitante cria conta e confirma propriedade do e-mail.
- Senha não é armazenada pela aplicação; autenticação é delegada ao provedor.
- Um usuário não consegue consultar, editar nem exportar conteúdo privado de outro.
- Administrador exige autenticação forte (MFA, quando suportado).

### 6.2 ONB-01 — Personalização acadêmica
**Campos:** nome de exibição, curso, instituição (catálogo + opção “não encontrei”), semestre/período, disciplinas atuais, temas de interesse, datas de provas (opcional), meta de minutos/dia, dias preferidos de estudo.  
**Saída:** `student_profile`, matrículas nas disciplinas, preferências de estudos e fila inicial de atividades.  
**Critérios de aceite:** usuário conclui onboarding sem datas de prova; consegue editar semestre e disciplinas depois; mudança de período não apaga tentativas anteriores; não recebe conteúdos de um curso diferente por acidente.

### 6.3 CAT-01 — Organização do conhecimento
Hierarquia lógica: **curso > matriz/currículo (opcional) > disciplina > assunto > subassunto > recursos**. Instituições podem relacionar disciplinas de seu currículo a assuntos canônicos, evitando replicação desnecessária do conteúdo.

Campos mínimos por questão: enunciado, 2–6 alternativas, alternativa correta, justificativa da correta e das incorretas, tema, dificuldade inicial, referências e versão; status editorial. Suportar texto, fórmulas e imagens licenciadas. Publicação somente depois de revisão editorial.

### 6.4 HOME-01 — Painel diário
**Blocos em ordem de prioridade:**
1. Próxima ação recomendada (“revisar 10 cartões de Fisiologia” ou “resolver 5 questões de metabolismo”).
2. Questão do dia.
3. Revisões vencidas e previsão de tempo.
4. Disciplinas e lacunas de aprendizagem.
5. Provas cadastradas e plano de preparação.
6. Progresso semanal e continuidade de estudo, sem penalização excessiva.

**Critérios:** a tela apresenta conteúdo útil mesmo para usuário sem histórico (cold start); recomendações têm justificativa curta; não mostrar porcentagens de proficiência sem evidência suficiente.

### 6.5 QUE-01/02 — Questões, diagnóstico e adaptação
**Fluxo:** escolher disciplina/assunto ou diagnóstico → carregar questão publicada → selecionar alternativa → registrar tentativa → exibir resultado, explicação e referência → oferecer flashcard, nova questão ou pergunta ao tutor.

**Diagnóstico inicial proposto:** 8 a 15 questões por disciplina priorizada, ajustável pelo administrador. Nunca travar o acesso se aluno pular o diagnóstico.

**Algoritmo V1 (heurístico, não alegar avaliação psicométrica):**
- Para cada `aluno × assunto`, manter `total_attempts`, `correct_attempts`, `last_attempt_at`, `estimated_mastery`, `confidence`.
- Estimar domínio a partir de acertos recentes com pesos por recência e dificuldade, evitando exibir valores precisos quando amostra pequena.
- Priorizar: revisões atrasadas > assunto fraco relacionado a prova próxima > assunto ativo do semestre > exploração equilibrada.
- Diversificar questões, evitar repetição imediata, controlar questões já respondidas e proporcionar progressão por dificuldade.
- Persistir o **motivo da recomendação** e versão do algoritmo para auditoria.

**Regras de integridade:** correção e gabarito não devem ser enviados ao navegador antes da resposta quando houver modo avaliativo; no modo treino, o servidor corrige e fornece explicação após submissão; impedir duplicidade de submissão por chave idempotente.

**Critérios:** aluno consegue responder, retomar histórico, filtrar e receber justificativa; questões revisadas trazem origem; indicadores refletem tentativas persistidas; assunto sem dados aparece como “sem diagnóstico”.

### 6.6 FC-01 — Flashcards
Flashcards editoriais por disciplina e pessoais criados pelo estudante; criação a partir de resposta errada ou material próprio (quando permitido). Registrar frente, verso, fonte, criador, visibilidade, assunto e histórico de revisão.

**Revisão espaçada V1:** implementação de algoritmo inspirado em SM-2, documentado e coberto por testes; classificação pelo aluno em “esqueci / difícil / bom / fácil”; calcular `due_at`, intervalo e estabilidade apropriada. A plataforma não deve prometer um algoritmo específico até sua implementação ser validada.

**Critérios:** fila dos vencidos; reprogramação consistente; acesso ao próprio histórico; itens privados não visíveis a terceiros; suporte a fusos horários e mudança de dia.

### 6.7 LIB-01 — Biblioteca inteligente
Resumos curados com título, curso/disciplina/assunto, autoria, revisão, versão, data, bibliografia e licença; busca textual; filtros por semestre, disciplina, tema e tipo.

Upload pessoal opcional no MVP: permitir arquivo PDF/texto **somente para uso privado do aluno**, com limites de tamanho e controles de segurança, sem distribuir material de terceiros; conteúdos gerados por IA a partir desse material não podem ser publicados automaticamente.

### 6.8 AI-01 — Tutor IA pessoal
Tutor sabe o contexto autorizado do aluno: curso, semestre, disciplina, assunto, histórico agregado de erros/acertos, material curado relacionado e objetivo da sessão. Explica em níveis de profundidade, cria exercícios de revisão, propõe plano pré-prova, ajuda a entender erros e avalia respostas discursivas com rubricas.

**Modo obrigatório:** educacional. Não simular vínculo assistencial, nem emitir diagnóstico clínico para pacientes reais. Diante de caso real ou solicitação sensível, informar limites e orientar uso de suporte profissional apropriado.  
**Fontes:** busca semântica/híbrida em materiais curados e licenciados; mostrar títulos/referências das fontes recuperadas. Caso não haja evidência suficiente, reconhecer a limitação sem fabricar citação.  
**Geração de novas questões:** rascunhos privados ou fila de revisão humana; **não publicar diretamente no banco oficial**.  
**Custos e abuso:** cotas por plano e usuário, limite de tokens por mensagem, histórico paginado, rate limits, medição por modelo/requisição e budget diário.

**Critérios:** conteúdo de outro aluno não entra no contexto; tutor explica origem da resposta quando usa base curada; tratamento de erro de API com opção de tentar novamente; métricas de custo e avaliação de resposta; logs não registram material sensível integralmente por padrão.

### 6.9 COM-01 — Comunidade mínima
Grupos por curso, disciplina ou instituição; postagens, comentários e denúncias; regras de conduta; moderação de conteúdo nocivo, plágio e divulgação de informações de pacientes. Sem chat privado e sem grupos de vídeo no MVP.

**Critérios:** usuário pode denunciar; moderador remove conteúdo e ação fica auditada; postagens respeitam visibilidade do grupo; bloqueio de spam.

### 6.10 ID-01 — Identidade digital e e-mail
A visão original exige e-mail no domínio da plataforma, mas **identidade acadêmica, endereço de recebimento e caixa postal completa são coisas diferentes**.

**Etapa MVP (obrigatória):**
1. Reservar `handle` exclusivo normalizado e imutável, por exemplo `ana.silva` (com política de colisões).
2. Exibir “Identidade acadêmica da plataforma” e perfil público/portfólio mínimo, com consentimento do aluno.
3. Manter um **centro de notificações interno**, associado ao perfil.
4. Habilitar endereço real `handle@dominio-da-plataforma` **somente quando** houver provedor/configuração para efetiva recepção, entrega, antispam e suporte. Antes disso, mostrar “endereço reservado”, nunca apresentar um e-mail funcional inexistente.
5. Enviar comunicações transacionais ao e-mail pessoal verificado e permitir preferências de marketing separadas.

**Etapa posterior:** correio eletrônico de entrada/saída de propósito geral, com provedor profissional, autenticação, recuperação, limites, antivírus, denúncia de abuso, políticas de retenção, custos por conta e suporte operacional.

**Atenção de marca:** não chamar o domínio de “e-mail institucional da faculdade” ou insinuar vínculo oficial com a universidade. Trata-se de identidade digital **da plataforma**.

**Critérios:** handles únicos de forma case-insensitive; moderação de nomes proibidos; impossibilidade de assumir handle alheio; consentimento de ofertas separado de comunicações essenciais; botão de exclusão/solicitação de dados.

### 6.11 ADM-01 — CMS e painel de controle
Administrar cursos, disciplinas, tópicos, referências, conteúdos e questões. Workflow `draft → in_review → approved → published → archived`; publicação permite reversão; registrar versão e revisor.

Área de auditoria, relatórios de usuários ativos/questões/IA, denúncias, quotas, custo por chamadas, flags e administração de conteúdo. Conteúdo antigo continua referenciável em tentativas passadas.

### 6.12 PAY-01 — Freemium
No MVP, implementar **entitlements** (permissões por plano), sem codificar preço na lógica: `free`, `premium`, e futuras licenças institucionais. Proposta inicial de diferenciação: free com limite de questões/tutor IA e flashcards básicos; premium com maior volume, simulados e recursos avançados.

**Atenção:** definir limites e preços após testes com estudantes. A ilustração de R$ 50 no documento de origem **não define valor de assinatura**. Cobrança recorrente via provedor externo brasileiro pode ser adicionada após ativação do produto; não armazenar dados de cartão no banco próprio.

---

## 7. Jornadas de ponta a ponta

### J01 — Primeiro acesso
`Landing` → `Criar conta` → `Verificar e-mail` → `Selecionar curso/instituição/semestre` → `Escolher disciplinas` → `Definir objetivo` → `Reservar identidade` (opcional ou adiável) → `Questão diagnóstica` (adiável) → `Dashboard personalizado`.

**Aceite:** estudante chega a uma atividade útil em poucos passos, mesmo pulando itens opcionais; não há tela vazia nem exigência de pagar.

### J02 — Sessão diária
`Dashboard` → `Resolver 5 questões recomendadas` → `Feedback` → `Registrar dificuldade` → `Adicionar flashcard` → `Ver próxima revisão`.

**Aceite:** sessão fica registrada; dashboard se atualiza; recomendação seguinte considera erros recentes.

### J03 — Preparação para prova
`Informar disciplina + data` → `Exibir assuntos prioritários e tempo disponível` → `Gerar plano adaptativo` → `Questões e flashcards` → `Recalcular progresso`.

**Aceite:** usuário consegue modificar data/meta; plano não promete aprovação; explica as prioridades.

### J04 — Perguntar ao tutor sobre erro
`Questão respondida` → `Perguntar à IA` → `Contexto autorizado da questão e tema` → `Explicação com referências, quando existentes` → `Próxima ação`.

**Aceite:** o tutor não revela dados privados de outros alunos e não inventa referências.

### J05 — Curadoria
`Editor cria questão` → `Salvar rascunho` → `Enviar revisão` → `Aprovador verifica precisão, licença, explicações e fontes` → `Publicar versão` → `Disponibilizar em estudo/diagnóstico`.

**Aceite:** uma questão não revisada não aparece nos fluxos oficiais.

---

## 8. UX, telas e navegação

### 8.1 Navegação do aluno
- `/` — landing e proposta de valor
- `/entrar`, `/cadastro`, `/recuperar-senha`
- `/onboarding`
- `/app` — dashboard
- `/app/disciplinas` e `/app/disciplinas/[id]`
- `/app/questoes` e `/app/questoes/sessao/[id]`
- `/app/revisoes` e `/app/flashcards`
- `/app/tutor`
- `/app/biblioteca` e `/app/biblioteca/[id]`
- `/app/plano-de-estudo`
- `/app/comunidades` e `/app/comunidades/[id]`
- `/app/identidade` e `/app/notificacoes`
- `/app/desempenho`
- `/app/perfil`, `/app/privacidade`, `/app/assinatura`

### 8.2 Navegação editorial/admin
- `/admin` — visão geral
- `/admin/cursos`, `/admin/disciplinas`, `/admin/assuntos`
- `/admin/questoes`, `/admin/biblioteca`, `/admin/revisoes-editoriais`
- `/admin/usuarios`, `/admin/denuncias`
- `/admin/metricas`, `/admin/ia`, `/admin/configuracoes`

### 8.3 Direção visual (proposta)
Interface web responsiva, mobile-first, calma e legível, com foco em densidade informacional moderada. Progresso visível e sem gamificação punitiva. Componentes reutilizáveis, estados vazios, loading, erros recuperáveis, contraste adequado, navegação por teclado, rotulagem de inputs e legendas/transcrições onde houver mídia.

**Não definir marca ou paleta final sem aprovação.** Usar tokens de design que permitam substituir a identidade visual.

---

## 9. Arquitetura de referência para desenvolvimento com Claude

**Escolha proposta para acelerar MVP web:**

| Camada | Solução inicial sugerida | Razão |
|---|---|---|
| Front-end | Next.js (App Router), React, TypeScript | Web app e rotas integradas |
| UI | Tailwind CSS + biblioteca de componentes acessíveis (ex.: shadcn/ui) | Velocidade e consistência |
| Back-end | Rotas e ações de servidor modularizadas em Next.js | Evitar fragmentação inicial |
| Banco | PostgreSQL gerenciado (ex.: Supabase) | Integridade e consultas relacionais |
| Autenticação | Supabase Auth ou serviço equivalente | Sessão, verificação, recuperação |
| Autorização | RLS + políticas e checagem server-side | Isolamento de dados |
| Arquivos | Object Storage privado com URL assinada | Biblioteca e materiais pessoais |
| IA | API da Anthropic para tutoria; camada de abstração de modelos | Centralizar prompt, custos, limites |
| RAG | PostgreSQL + `pgvector`, com embeddings fornecidos por modelo adequado | Busca com controle de fontes |
| Jobs | Fila/cron gerenciados para lembretes, indexação e cálculo de revisões | Não bloquear requisições |
| E-mail transacional | Provedor especializado (a selecionar) | Confirmação e notificações |
| Telemetria | Eventos de produto + erros + logs estruturados | Qualidade e retenção |
| Pagamentos | Adapter para provedor brasileiro (a escolher) | PIX, boleto, recorrência conforme demanda |

**Observação:** Next.js, Supabase e fornecedores acima são uma **proposta técnica**, não imposição do conceito original. Se já houver stack no repositório, o Claude deve inspecioná-la antes de decidir migração.

### 9.1 Organização recomendada do repositório
```text
src/
  app/
    (public)/                 # landing, acesso e onboarding
    (student)/app/            # rotas autenticadas do aluno
    admin/                    # rotas administrativas protegidas
    api/                      # endpoints externos e webhooks
  features/
    auth/ onboarding/ catalog/ learning/
    questions/ flashcards/ tutor/ library/
    communities/ identity/ billing/ analytics/
  components/
    ui/                       # componentes base
    shared/                   # layout, empty states, error states
  lib/
    db/ auth/ ai/ storage/ events/ security/
  server/
    services/ repositories/ policies/
  types/
  tests/
    unit/ integration/ e2e/
database/
  migrations/
  seeds/
  policies/
docs/
  architecture/ decisions/ api/
```

### 9.2 Regras arquiteturais
- Regras de negócio em serviços testáveis; componentes não acessam diretamente tabelas sensíveis.
- Validação de payload no servidor (ex.: Zod).
- Tipos gerados do banco; migrações versionadas.
- Segredos somente em variáveis do servidor; nunca exportar chave de administração ao navegador.
- Todos os recursos do aluno usam identificador de proprietário e autorização explícita.
- Erros padronizados, idempotência para mutações críticas e limites por IP/usuário.
- Features futuras em módulos separados; **não** criar dezenas de tabelas vazias sem caso de uso.
- Uso de provedores externos via interfaces (`AIProvider`, `MailProvider`, `PaymentProvider`).

---

## 10. Modelo de dados inicial (entidades e relações)

A lista representa **modelo lógico**; o Claude deverá definir migrações SQL com tipos, índices, unicidade, chaves estrangeiras, constraints e RLS antes de iniciar telas que as utilizem.

### 10.1 Usuário e organização acadêmica
| Tabela | Campos essenciais | Regras |
|---|---|---|
| `profiles` | `id`, `display_name`, `avatar_url`, `created_at` | `id` referencia usuário da autenticação |
| `role_assignments` | `user_id`, `role`, `granted_by`, `created_at` | Apenas admin atribui privilégios |
| `institutions` | `id`, `name`, `state`, `city`, `status` | Permitir sugestão e moderação |
| `courses` | `id`, `name`, `slug`, `active` | Multi-curso |
| `curricula` | `id`, `course_id`, `institution_id?`, `name`, `version` | Opcional por instituição |
| `disciplines` | `id`, `course_id`, `name`, `slug`, `period_hint?`, `active` | Assunto canônico reutilizável |
| `topics` | `id`, `discipline_id`, `parent_id?`, `name`, `slug`, `order_index` | Hierarquia recursiva |
| `student_profiles` | `user_id`, `course_id`, `institution_id?`, `semester`, `study_goal_minutes`, `onboarding_completed_at` | Um perfil acadêmico ativo inicial |
| `student_disciplines` | `student_id`, `discipline_id`, `active_since`, `active_until?` | Histórico não é apagado |
| `exam_dates` | `id`, `student_id`, `discipline_id`, `exam_at`, `title` | Opcional; guarda timezone |

### 10.2 Aprendizagem
| Tabela | Campos essenciais | Regras |
|---|---|---|
| `questions` | `id`, `topic_id`, `body`, `difficulty`, `status`, `version`, `author_id`, `reviewer_id?`, `published_at?` | Só `published` entra no estudo |
| `question_options` | `id`, `question_id`, `body`, `is_correct`, `explanation`, `display_order` | Gabarito nunca vazado antes do envio |
| `question_sources` | `id`, `question_id`, `citation`, `url?`, `accessed_at?` | Fonte editorial |
| `question_sessions` | `id`, `student_id`, `mode`, `started_at`, `finished_at?` | Treino/diagnóstico |
| `question_attempts` | `id`, `session_id`, `question_id`, `student_id`, `selected_option_id`, `is_correct`, `answered_at`, `duration_seconds?`, `client_attempt_key` | Idempotência por tentativa |
| `topic_mastery` | `student_id`, `topic_id`, `estimated_mastery?`, `confidence`, `attempt_count`, `algorithm_version`, `updated_at` | Estimativa, não nota oficial |
| `learning_recommendations` | `id`, `student_id`, `topic_id`, `type`, `reason_code`, `algorithm_version`, `created_at`, `consumed_at?` | Rastreabilidade |
| `flashcards` | `id`, `owner_id?`, `topic_id?`, `front`, `back`, `source_id?`, `visibility`, `status` | Editorial ou pessoal |
| `flashcard_schedules` | `student_id`, `flashcard_id`, `due_at`, `interval_days`, `ease_or_stability`, `repetitions`, `algorithm_version` | Unique aluno × card |
| `flashcard_reviews` | `id`, `student_id`, `flashcard_id`, `rating`, `reviewed_at`, `next_due_at` | Histórico imutável |
| `study_plans` | `id`, `student_id`, `goal`, `target_date?`, `status`, `created_at` | Plano adaptável |
| `study_plan_items` | `id`, `plan_id`, `topic_id`, `task_type`, `due_at?`, `completed_at?` | Prioridade e execução |

### 10.3 Conteúdo, IA e operações
| Tabela | Campos essenciais | Regras |
|---|---|---|
| `learning_resources` | `id`, `topic_id`, `title`, `content_type`, `body_or_storage_key`, `license`, `status`, `version`, `reviewer_id?` | Resumos, PDFs, mídias |
| `ai_conversations` | `id`, `student_id`, `topic_id?`, `created_at` | Privado |
| `ai_messages` | `id`, `conversation_id`, `role`, `content`, `model_id`, `source_refs`, `created_at` | Retenção configurável |
| `ai_usage` | `id`, `user_id`, `feature`, `model`, `input_tokens`, `output_tokens`, `estimated_cost`, `created_at` | Custos e quota |
| `communities` | `id`, `course_id?`, `discipline_id?`, `institution_id?`, `visibility`, `name` | Grupo conforme escopo |
| `community_members` | `community_id`, `user_id`, `role`, `joined_at` | ACL de acesso |
| `posts` | `id`, `community_id`, `author_id`, `body`, `status`, `created_at` | Moderação |
| `post_comments` | `id`, `post_id`, `author_id`, `body`, `status`, `created_at` | Moderação |
| `content_reports` | `id`, `reporter_id`, `target_type`, `target_id`, `reason`, `status` | Auditoria de denúncias |
| `digital_identities` | `user_id`, `handle`, `domain`, `status`, `mail_enabled_at?` | Unique (`domain`,`lower(handle)`) |
| `notifications` | `id`, `user_id`, `type`, `payload`, `read_at?`, `created_at` | Privadas |
| `consent_records` | `id`, `user_id`, `purpose`, `granted`, `policy_version`, `recorded_at` | Marketing separado |
| `plans` | `id`, `code`, `entitlements`, `active` | Limites dinâmicos |
| `subscriptions` | `id`, `user_id`, `plan_id`, `status`, `provider_ref?`, `current_period_end?` | Não armazenar cartão |
| `audit_logs` | `id`, `actor_id`, `action`, `entity_type`, `entity_id`, `created_at`, `metadata` | Restringir acesso |
| `product_events` | `id`, `actor_id?`, `event_name`, `properties`, `created_at` | Sem PII excessiva |

**Índices importantes:** questões por assunto/status/dificuldade; tentativas por aluno/data; flashcards por usuário/data de vencimento; recursos por curso/assunto/status; busca textual dos recursos; vetor `pgvector` dos segmentos de recursos revisados; unicity de `client_attempt_key` por aluno; índice case-insensitive para handle.

**Semeadura obrigatória:** pelo menos um curso, duas disciplinas de exemplo, assuntos, questões revisadas, resumos, perfil de editor e papéis básicos. **Dados de demonstração não podem ser apresentados como conteúdo médico validado em produção.**

---

## 11. Contratos de API (versão inicial)

Proposta: rotas `api/v1` ou actions equivalentes. Todas as respostas de erro seguem estrutura `{ code, message, details?, requestId }`. Paginação cursor-based para listas longas. Evitar confiar em `studentId` enviado pelo cliente; derivar identidade da sessão.

| Método | Rota | Descrição |
|---|---|---|
| `GET/PATCH` | `/api/v1/me` | Perfil |
| `POST` | `/api/v1/onboarding` | Onboarding idempotente |
| `GET` | `/api/v1/catalog/courses` | Cursos ativos |
| `GET` | `/api/v1/catalog/disciplines?courseId=` | Disciplinas filtradas |
| `GET` | `/api/v1/dashboard` | Atividades e indicadores |
| `POST` | `/api/v1/questions/sessions` | Criar sessão de treino/diagnóstico |
| `GET` | `/api/v1/questions/sessions/:id/next` | Próxima questão sem gabarito |
| `POST` | `/api/v1/questions/attempts` | Corrigir, persistir e responder feedback |
| `GET` | `/api/v1/flashcards/due` | Revisões pendentes |
| `POST` | `/api/v1/flashcards/:id/reviews` | Revisar e recalcular prazo |
| `GET` | `/api/v1/resources` | Biblioteca filtrada |
| `POST` | `/api/v1/tutor/messages` | Mensagem ao tutor; resposta com fontes e uso |
| `GET/POST` | `/api/v1/study-plans` | Planos do estudante |
| `GET/POST` | `/api/v1/communities` | Consulta/associação conforme permissão |
| `POST` | `/api/v1/identity/reserve` | Reserva exclusiva de handle |
| `GET/PATCH` | `/api/v1/communication-preferences` | Preferências por finalidade |
| `GET` | `/api/v1/notifications` | Caixa interna |
| `GET/POST/PATCH` | `/api/v1/admin/questions` | Operações editoriais autorizadas |
| `POST` | `/api/v1/admin/questions/:id/publish` | Publicação apenas por revisor |

**Exemplo de resultado de tentativa:**
```json
{
  "attemptId": "uuid",
  "isCorrect": false,
  "correctOptionId": "uuid",
  "explanation": "Explicação revisada pelo editor",
  "sourceRefs": [{ "label": "Referência editorial", "url": null }],
  "mastery": { "status": "insufficient_data", "topicId": "uuid" },
  "nextActions": ["review_topic", "create_flashcard", "ask_tutor"]
}
```

**Exemplo de resposta do tutor:**
```json
{
  "messageId": "uuid",
  "answer": "Explicação educacional...",
  "sources": [{ "resourceId": "uuid", "title": "Resumo editorial" }],
  "confidenceNote": "Resposta baseada nos materiais encontrados",
  "usage": { "quotaRemaining": 19 },
  "safety": { "educationalOnly": true }
}
```

---

## 12. Especificação de IA e mecanismo adaptativo

### 12.1 Pipeline do tutor
1. Autenticar usuário e checar quota/limites.
2. Recuperar contexto acadêmico mínimo necessário.
3. Identificar intenção (explicação, planejamento, revisão de erro, criação de flashcard, avaliação discursiva).
4. Buscar materiais revisados e autorizados; filtrar por curso, disciplina e privacidade.
5. Construir instrução de sistema versionada e contexto com **fontes tratadas como dados não confiáveis**.
6. Chamar modelo; validar formato estruturado quando aplicável; registrar custo e tempo.
7. Responder com fontes, incertezas e próximo passo de estudo.
8. Armazenar histórico com retenção e controles do aluno.

### 12.2 Requisitos de segurança e qualidade
- Nunca obedecer instruções escondidas em PDFs ou conteúdo recuperado que tentem mudar as regras do sistema (*prompt injection*).
- Não tratar texto produzido pelo modelo como conteúdo médico editorialmente aprovado.
- Questões geradas por IA não entram no banco oficial sem revisão humana.
- Dados pessoais e uploads privados são isolados por usuário.
- Não permitir que tutor escreva diretamente em tabelas sensíveis por instruções conversacionais.
- Oferecer avaliação da resposta e sinalização de erro factual.
- A versão do prompt e do modelo deve ser observável em logs administrativos, sem expor segredos.

### 12.3 Conjunto de testes de IA (proposto)
Montar dataset editorial de pelo menos 30 casos cobrindo: explicação correta, pergunta ambígua, ausência de fonte, erro de questão, conteúdo de outro curso, tentativa de prompt injection, pedido de orientação clínica real, citação inexistente e material com licença restrita. Avaliar precisão, cobertura de fontes, segurança e utilidade; usar revisão humana antes de ampliar usuários.

### 12.4 Evolução do adaptativo
- **V1:** regras transparentes + estatística básica de desempenho recente.
- **V2:** testes A/B de sequenciamento e adaptação por nível de conhecimento.
- **V3:** modelos de domínio mais sofisticados apenas com volume de dados, validação e governança apropriados.

Não anunciar “diagnóstico preciso da aprendizagem” antes de evidência de validade.

---

## 13. Privacidade, segurança, qualidade e conformidade

### 13.1 LGPD e privacidade
- Definir finalidades por categoria: autenticação, personalização pedagógica, cobrança, comunidade, comunicação essencial e marketing.
- Registrar versões dos termos e dos consentimentos onde aplicável; retirar consentimento de marketing sem bloquear serviço essencial.
- Interface para solicitar acesso, correção e exclusão/anonimização dos dados conforme obrigações aplicáveis.
- Políticas de retenção para conversas IA, atividades, uploads, e-mail e logs; prazos definidos com revisão jurídica.
- Dados educacionais individuais não podem ser expostos a universidades por padrão. Indicadores institucionais agregados exigem salvaguardas, limites de grupos e base legal adequada.
- Preferir dados sintéticos nos simuladores; proibir dados identificáveis de pacientes reais em materiais enviados.
- Avaliar necessidade de RIPD e contratos com operadores antes de operação em escala.

### 13.2 Segurança de aplicação
- RLS validado por testes automatizados; nenhuma consulta cruzada entre alunos.
- Autenticação reforçada e segregação de administradores.
- Rate limiting, proteção CSRF onde aplicável, controle de uploads, MIME real, varredura antimalware quando houver anexos.
- Criptografia em trânsito e em repouso conforme serviços; backups e recuperação testada.
- Storage privado e URLs temporárias; observabilidade sem tokens/senhas/PII em texto claro.
- Política de denúncia, abuso, direitos autorais e revisão de conteúdo acadêmico.
- Segurança em pagamentos delegada a processador apropriado.

### 13.3 Desempenho e confiabilidade (metas propostas de piloto)
- Rotas principais responsivas em dispositivos móveis comuns; objetivo inicial p95 de navegação interativa até 3 s sob condições de teste definidas.
- Respostas do tutor com feedback de processamento e timeout recuperável; meta inicial p95 de até 15 s, a validar por modelo e carga.
- Monitorar disponibilidade do aplicativo, falhas por release, backlog de jobs, custo de IA e geração de notificações.
- Acessibilidade orientada a **WCAG 2.2 AA** como meta de implementação, sujeita a auditoria.
- Controle de timezone `America/Sao_Paulo` no piloto com persistência de timestamps em UTC e apresentação no fuso do usuário.

---

## 14. Modelo comercial e operações

### 14.1 Hipóteses de monetização do conceito
1. Freemium com upgrade por recursos avançados.
2. Banco adaptativo, cursos, videoaulas e tutor IA como motores de recorrência.
3. Aulas particulares, monitorias e comissões do marketplace.
4. Licenças universitárias por contrato na expansão.
5. Publicidade/ofertas segmentadas, sempre sujeitas a consentimento e políticas adequadas.

### 14.2 Limites comerciais no código
- Planos como configuração de entitlements; não misturar pagamento com direitos de acesso.
- Assinaturas com estados explícitos e webhooks idempotentes.
- Suporte a vouchers e períodos de teste somente após decisão de produto.
- Não afirmar que e-mail digital equivale a benefício oficial de estudante para obtenção de descontos externos.

### 14.3 Operação editorial
Definir responsáveis por revisão científica e bibliográfica, curadoria, direitos autorais, atualização de diretrizes e resposta a denúncias. Todo material de saúde publicável precisa identificar sua responsabilidade editorial e data de atualização.

---

## 15. Roadmap por marcos e critérios de saída

### M0 — Fundação técnica
**Entregáveis:** repositório, padrões, ambiente local, autenticação, esquema inicial, migrations, RLS, design system, CI, seeds de demonstração, rotas protegidas.  
**Gate:** build, lint, testes mínimos e testes de isolamento de dados passam; deploy de preview funcional.

### M1 — Aprendizagem ativa mínima
**Entregáveis:** onboarding, catálogo, dashboard, questões revisadas, tentativas, feedback, diagnóstico inicial e recomendações V1.  
**Gate:** estudante do piloto percorre cadastro → personalização → 5 questões → feedback → indicação da próxima atividade sem intervenção da equipe.

### M2 — Formação de hábito
**Entregáveis:** flashcards, revisão espaçada, biblioteca, plano pré-prova, métricas, notificações, experiência mobile.  
**Gate:** dados de questões alimentam revisão, dashboard e métricas; nenhum dado de outro aluno é acessível.

### M3 — Tutor IA e identidade digital
**Entregáveis:** tutor contextual com RAG e quota, referências, registro de custos, reserva de identidade, centro interno de notificações; piloto de e-mail real somente se infraestrutura operacional validada.  
**Gate:** bateria de casos de IA aprovada; limites de custo e privacidade testados; identidade única e honesta sobre funcionalidade de e-mail.

### M4 — Piloto fechado e ajustes
**Entregáveis:** comunidades mínimas, moderação, operação editorial, feedback in-product, analytics, ajustes de onboarding, segurança e preços experimentais.  
**Gate:** grupo real de estudantes conclui jornadas principais; defeitos críticos resolvidos; métricas de retenção e uso verificadas.

### M5 — Expansão comercial (Fase 2 do conceito)
**Entregáveis:** videoaulas, cursos, simulados, professor sob demanda, pagamentos, regras de comissionamento e portfólio de cursos.  
**Gate:** compra, acesso, cancelamento, atendimento e repasses testados ponta a ponta.

### M6 — Institucional e simulação (Fases 3 e 4)
**Entregáveis:** turmas e licenças; indicadores agregados; integrações; estágios; pacientes virtuais; OSCE; recursos XR conforme viabilidade.  
**Gate:** conformidade contratual, pedagógica e técnica avaliada para cada nova frente.

---

## 16. Backlog inicial para o Claude Code

| Ordem | Épico | Histórias principais | Dependência |
|---|---|---|---|
| 01 | Fundação | Scaffold, env.example, deploy, testes, CI, banco, migrations | Nenhuma |
| 02 | Contas | Auth, confirmação, sessão, recuperação, RBAC/RLS | 01 |
| 03 | Catálogo acadêmico | Cursos, disciplinas, temas, seeds e gestão admin | 02 |
| 04 | Onboarding | Perfil de aluno, escolha de curso/semestre/disciplina | 03 |
| 05 | Questões/editorial | CRUD revisado, publicação, sessão, correção e histórico | 03–04 |
| 06 | Painel e diagnóstico | Recomendações, questão do dia, baseline | 05 |
| 07 | Flashcards | CRUD privado, fila de vencidos e revisão | 04–06 |
| 08 | Biblioteca | Resumos, referências, indexação e busca | 03 |
| 09 | Tutor IA | Mensagens, RAG, cotas, avaliação, proteção | 06 + 08 |
| 10 | Identidade digital | Handle, privacidade, centro de notificações | 02 + 04 |
| 11 | Comunidades | Grupo, post, comentário, denúncia, moderação | 04 |
| 12 | Produto e piloto | Analytics, QA, consentimentos, perf, feedback | Todos |

**Padrão de cada história:** objetivo; critérios de aceite; telas/estados; alterações de dados e RLS; contratos de API; tratamento de erro; testes unitários/integração/E2E; eventos de analytics; checklist de segurança; documentação.

---

## 17. Testes e definição de pronto

### 17.1 Testes obrigatórios
- **Unitários:** score de domínio, seleção de questão, repetição espaçada, regras de plano, normalização de handle.
- **Integração:** autenticação/RLS, tentativas com idempotência, publicações editoriais, quotas de IA, busca por curso/assunto.
- **E2E:** cadastro → onboarding → sessão de questões → flashcard → dashboard; editor → revisão → publicação; denúncia → moderação.
- **Segurança:** duas contas não leem conteúdo privado uma da outra; editor não pode publicar sem aprovação; visitante não consulta API privada; HTML/XSS em comunidade e biblioteca.
- **IA:** respostas com e sem fonte, erro de API, prompts maliciosos em materiais, limite de custo, pedidos clínicos reais.
- **Acessibilidade:** teclado, foco, formulário, contraste, leitor de tela; executar varredura automatizada e validação manual.

### 17.2 Definition of Done por entrega
Uma funcionalidade está pronta apenas se: (1) fluxos felizes e erros implementados; (2) validação/autorização completas; (3) migrations reversíveis ou migração com plano seguro; (4) testes automatizados relevantes passando; (5) interface responsiva e acessível; (6) eventos/logs adequados; (7) nenhuma chave sensível exposta; (8) documentação atualizada; (9) revisão do comportamento real, sem apenas confiar em mocks.

---

## 18. Decisões pendentes (não bloquear scaffold)

| ID | Decisão | Proposta para não travar desenvolvimento |
|---|---|---|
| D01 | Nome e identidade visual final | Usar tokens e marca placeholder |
| D02 | Curso/disciplina/instituições do piloto | Criar estrutura multi-curso, sem inventar conteúdo validado |
| D03 | Fornecedor de infraestrutura | Proposta Next.js + PostgreSQL/Supabase, passível de revisão |
| D04 | Políticas de preço e limites | Plano free/premium parametrizável; preços não codificados |
| D05 | Provedor de pagamento | Adapter, ativar quando houver definição comercial |
| D06 | Serviço de identidade digital | Reservar handle e inbox interno no MVP; e-mail real apenas com fornecedor validado |
| D07 | Direitos de conteúdos, atlas, PDFs e videoaulas | Apenas conteúdos próprios/licenciados; fontes registradas |
| D08 | Responsável pela revisão científica | Exigir atribuição antes de produção com temas de saúde |
| D09 | Privacidade/retensão e regras institucionais | Revisão jurídica e documentação antes do piloto externo |
| D10 | Canal mobile nativo | Web responsivo/PWA progressivo inicialmente; app nativo mais tarde |
| D11 | Parceiros e docentes | Módulos isolados, não travam MVP |

---

## 19. Instruções de execução para Claude Code

### 19.1 Como trabalhar
1. Ler esta especificação inteira e o `CLAUDE.md` do repositório.
2. Inspecionar a estrutura existente antes de criar ou substituir arquivos.
3. Identificar o **marco atual**, dividir em tarefas pequenas e apresentar o plano de arquivos/migrações/testes.
4. Se uma decisão de negócio estiver pendente, aplicar apenas o default explicitado na tabela D01–D11 e registrar uma ADR em `docs/decisions/`.
5. Implementar um único épico ou vertical slice por interação, sem prometer concluir todo o produto numa única geração.
6. Gerar ou atualizar migrations e políticas RLS antes de codificar acesso aos dados.
7. Executar lint, checagem de tipos, testes e build disponíveis; registrar o resultado verdadeiro, sem fingir execução.
8. Entregar resumo de alterações, decisões, comandos rodados, riscos e próxima tarefa.

### 19.2 Primeiro recorte recomendado
Construir **M0 + o início de M1**:
- Scaffold com Next.js + TypeScript + Tailwind (se não existir repositório).
- Estrutura modular, layout de aluno/admin e tokens de design.
- Banco/PostgreSQL com `profiles`, `courses`, `institutions`, `disciplines`, `topics`, `student_profiles`, `student_disciplines`, `role_assignments`.
- Auth e autorização, RLS, seeds, testes de isolamento.
- Onboarding funcional com dados fictícios **marcados como demonstração**.
- Dashboard em empty state real, com integração ao banco e sem métricas inventadas.

**Não iniciar tutor IA, marketplace, e-mail completo ou simulador clínico antes de concluir e testar essa fundação.**

---

## 20. Prompt inicial pronto para o Claude Code

```text
Você será o arquiteto de software e engenheiro principal de uma plataforma de aprendizagem para estudantes de graduação em saúde.

LEIA integralmente os arquivos SPEC_Plataforma_Integrada_Estudantes_Saude_v1.md e CLAUDE.md. Eles são a fonte de verdade do projeto. Separe requisitos derivados da visão original de decisões técnicas propostas.

Objetivo imediato: executar M0 (Fundação técnica), sem tentar construir o produto inteiro. Se o repositório estiver vazio, proponha e implemente um scaffold com Next.js App Router, TypeScript, Tailwind e PostgreSQL/Supabase. Se houver código existente, inspecione-o e proponha uma adaptação incremental antes de modificar a stack.

Antes de codificar:
1. Inspecione a árvore de arquivos e o estado do repositório.
2. Apresente um plano curto dividido em pequenas entregas e critérios de aceite.
3. Liste decisões pendentes relevantes; aplique somente os defaults autorizados pela spec.
4. Não invente chaves, credenciais, fontes médicas ou dados institucionais.

Em cada entrega:
- Escreva código de produção tipado, validado, seguro e legível.
- Crie migrations e RLS quando usar dados privados.
- Adicione testes relevantes e estados de erro/empty/loading.
- Execute os comandos de verificação disponíveis e relate os resultados reais.
- Atualize documentação/ADR quando houver escolha arquitetural.
- Mostre arquivos alterados, riscos e próximo passo.

Comece agora inspecionando o repositório e detalhando a primeira entrega de M0. Se estiver vazio, inicie pelo scaffold, configuração de ambiente e base de testes.
```

---

## 21. Critério de sucesso do primeiro piloto

O produto terá validado sua proposta básica quando um estudante real conseguir, em celular ou computador:

1. Criar conta e informar curso, semestre e disciplinas.
2. Encontrar imediatamente uma questão adequada ao contexto.
3. Receber explicação editorialmente revisada após responder.
4. Identificar um assunto fraco sem falsa precisão estatística.
5. Revisar flashcards no dia correto e perceber sua evolução.
6. Consultar tutor IA com contexto, fontes e limites claros.
7. Controlar perfil, comunicações e identidade digital da plataforma.
8. Repetir esse ciclo em vários dias, demonstrando utilidade observável.

O projeto **não depende** de construir todos os serviços do ecossistema para testar essa hipótese. O aprendizado demonstrável e a recorrência vêm antes da complexidade comercial e institucional.
