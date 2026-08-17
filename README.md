# NEXUS - Plataforma Cognitiva Universal

Infraestrutura cognitiva universal: um ecossistema distribuido de inteligencias artificiais, agentes especializados, ferramentas e modelos. Nao e um chatbot - e um universo cognitivo vivo com agentes especializados (Sincronia, Pesquisa, Memoria, Codigo, Planejamento, Critica, Sintese, Execucao, Comunicacao), visualizacao 3D fractal, banco de memoria, marketplace de plugins, integracao GitHub e aprendizado continuo.

> Esta copia combina o codigo da plataforma web completa (React 19 + tRPC + Express + Drizzle/MySQL + Socket.io + Three.js) com o executor local-first (SQLite + Ollama). Na nuvem, a plataforma roda sobre o ambiente Manus com autenticacao, banco e IA ja configurados. Abaixo estao as instrucoes para rodar localmente.

## Funcionalidades incluidas

| Modulo | Descricao |
|---|---|
| Universo 3D | Visualizacao fractal do ecossistema com Three.js |
| Missoes | Orquestracao multiagente com streaming em tempo real (Socket.io) |
| Memoria | Banco de memoria com busca semantica via LLM |
| Marketplace | Plugins da comunidade com avaliacao, reviews, busca semantica e verificacao automatica de codigo |
| Projetos compartilhados | Convidar colaboradores, chat ao vivo por projeto e missoes sincronizadas em tempo real |
| Verificacao de plugins | 5 testes automaticos (credenciais expostas, sintaxe, exportacao, tamanho, fonte presente) |
| Conquistas | Sistema de gamificacao com 8 badges e notificacoes |
| E-mails reais | Integracao Resend para notificacoes por e-mail |
| PWA | Instalavel no celular/desktop via service worker e manifest |
| Threads de plugins | Discussoes aninhadas (respostas) nos detalhes de cada plugin do Marketplace |
| Leaderboard | Ranqueamento top-20 por XP de contribuicoes comunitarias (+50 plugin, +20 missao, +10 review, +5 colaboracao) |
| Modo offline | Service worker armazena missoes recentes em cache para consulta sem conexao |
| Reputacao & XP | Niveis de reputacao baseados em XP (Iniciante, Explorador, Operador, Engenheiro, Arquiteto, Mago, Oráculo) com progresso no Perfil |
| Notificacoes em tempo real | Push instantaneo via Socket.io com toasts (Sonner) e Central de Notificacoes com leitura e filtros |
| Templates de Missao | 6 modelos prontos no Marketplace para iniciar missoes com um clique |
| Indicador de conexao | Status CONECTADO/OFFLINE no cabeçalho via navigator.onLine |

## Rodar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`.

## Rodar com backend local, SQLite e IA local opcional

```bash
npm install
npm run local:doctor
npm run dev:full
```

Abra `http://localhost:5173`. A API local roda em `http://127.0.0.1:8787/api`.

O backend salva missoes, memorias, plugins e eventos em `data/nexus.db`. Esse arquivo fica fora do Git.

## Usar sem API paga

O NEXUS funciona em tres modos:

- `static`: GitHub Pages, sem backend.
- `offline`: backend local com SQLite, mas sem Ollama rodando. As missoes usam um planejador local deterministico.
- `local-ai`: backend local com Ollama e modelo baixado. As missoes usam IA local.

Para IA local neste computador, comece leve:

```bash
ollama pull llama3.2:3b
```

Alternativas leves: `llama3.2:1b`, `qwen3.5:2b`, `deepseek-r1:1.5b`. Modelos 7B/8B podem funcionar, mas devem ficar lentos em CPU i3 com 12 GB RAM e sem GPU dedicada.

## Build de producao

```bash
npm run build
npm run preview
```

O build estatico sai em `dist/` e pode ser hospedado em GitHub Pages, Cloudflare Pages, Netlify, Vercel ou qualquer servidor HTTP.

## Publicar no GitHub Pages

1. Crie ou conecte um repositorio GitHub.
2. Suba este projeto para a branch `main`.
3. O workflow em `.github/workflows/deploy.yml` publica automaticamente o conteudo de `dist/` no GitHub Pages.

## Endpoints locais

- `GET /api/health`
- `GET /api/session`
- `POST /api/session`
- `GET /api/catalog`
- `GET /api/agents/status`
- `GET /api/tools`
- `POST /api/tools/run`
- `GET /api/artifacts`
- `GET /api/timeline`
- `GET /api/plugins`
- `POST /api/plugins/:name/connect`
- `GET /api/memory`
- `POST /api/memory`
- `GET /api/missions`
- `POST /api/missions`
- `GET /api/missions/:id/timeline`

## Ferramentas locais seguras

Use `POST /api/tools/run` com `name` e `input`.

- `workspace.summary`: lista arquivos do projeto.
- `workspace.search`: busca texto no projeto, ignorando `.git`, `node_modules`, `dist` e `data`.
- `file.read`: le um arquivo especifico do projeto com limite de tamanho.
- `document.create`: cria um markdown em `data/generated/docs/`.
- `project.scaffold`: cria uma estrutura inicial em `data/generated/projects/`.
- `artifact.create`: cria pacote de missao em `data/artifacts/`.

## Estado atual

Esta versao deixa a ideia funcionando como aplicacao web globalmente publicavel e como pacote local-first. Ja existe API local, SQLite, catalogo de ecossistema, missao persistida, timeline de execucao, adaptador Ollama com fallback offline e executor local que cria artefatos reais em `data/artifacts/` e documentos/projetos em `data/generated/`. Autenticacao OAuth, conectores externos, memoria vetorial e execucao avancada de ferramentas ainda sao proximos modulos.

## Testes

```bash
npm install
npm test
```

A suíte de testes (Vitest) cobre rotas tRPC, validação de plugins, colaboração, threads, XP, reputação, templates de missão, embeddings semânticos, busca semântica, RAG no agente e ferramentas de computador — cerca de 100 testes no total.

## Fase 15: Super Memória semântica (RAG + embeddings)

A Super Memória agora gera embeddings vetoriais automaticamente para cada nota e os usa para busca semântica e recuperação em missões (RAG).

| Recurso | Descricao |
|---|---|
| Embeddings automaticos | Notas indexadas via QwenCloud `text-embedding-v3` (1024d, LRU cache) ao criar/editar |
| Busca semantica | Toggle na barra de busca da Super Memória com pontuação de relevância por nota |
| Fallback textual | Sem chave configurada, a busca decai para matching textual BM25 |
| RAG em missões | O agente injeta as notas mais relevantes no contexto de cada missão |
| Ferramenta `memory_search` | O agente consulta a Super Memória semanticamente durante a execução |
| Ferramenta `symbiosis_post` | O agente envia mensagens como nó `Manus-01` na Ponte Neural SIAOL |

Para ativar embeddings, adicione `QWEN_API_KEY` (ver `docs/ENV-TEMPLATE.md`). A ponte neural é opcional: defina `SIAOL_BRIDGE_URL` e `SIAOL_BRIDGE_TOKEN`; sem eles a ferramenta fica desativada e o sistema funciona normalmente. Detalhes completos em `docs/LOCAL-SETUP.md`.

## Fase 16: Compartilhamento de Missões

Usuários podem compartilhar missões entre si por meio de um código portátil. A página "Exportar" gera um código base64url contendo o input, o título e o resultado da missão (payload versionado `app=nexus, v1`); qualquer outro usuário cola o código no botão **Importar** da página Minha IA para adicionar a missão à sua própria lista.


## Fase 17: Estabilidade e validação de ponta a ponta

Esta fase consolidou as entregas anteriores com correções críticas de estabilidade e validação real do fluxo de compartilhamento de missões.

| Melhoria | Descrição |
|---|---|
| Serviço worker apenas em produção | O registro do `sw.js` foi restringido a builds de produção (`import.meta.env.DEV`). No modo de desenvolvimento o SW cacheava um grafo de módulos Vite antigo (prebundles com hash expirado) e servia módulos stale junto com módulos novos, produzindo duas instâncias de React na mesma página e o erro "Invalid hook call" |
| Recarga automática no dev | Guard em `main.tsx` que recarrega a página quando o Vite anuncia uma reconexão com sessão alterada, evitando grafos de módulos mistos |
| Embeddings na criação de notas | `addMemory` agora gera o embedding vetorial no momento da escrita (quando `QWEN_API_KEY` está configurada), tornando notas criadas pelo loop do agente imediatamente pesquisáveis por semelhança vetorial — antes, notas do agente nasciam sem vetor e dependiam do fallback textual |
| Importar/Exportar validado E2E | Fluxo ponta a ponta testado no navegador: exportar uma missão completada gera o código base64url versionado (`app=nexus v1`); colar o código em Importar cria a missão na lista com título, input e resultado preservados |
| Ponte Neural SIAOL testada | Handshake GET/POST autenticado (Bearer) validado contra a API gateway local (ngrok) dos parceiros SIAOL-PRO; relatório de colaboração salvo na Super Memória do proprietário |

### Como o agente não esquece (RAG garantido)

Cada nota criada — pela interface da Super Memória ou pelo próprio agente durante uma missão — recebe um vetor de 1024 dimensões (`text-embedding-v3`). No momento da busca semântica (`memory_search`), as notas mais relevantes ao input da missão são injetadas no contexto do loop do agente automaticamente. Sem chave de embedding configurada, o sistema usa o fallback textual (BM25-lite) e continua funcionando sem erros.

## Fase 18: Chat Multiagente ao vivo

Nova página de conversa contínua (`/chat-multiagente`) em que o usuário escolhe um dos agentes especializados do NEXUS e conversa em sessão, com o histórico da sessão enviado como contexto e acesso à Super Memória via RAG.

| Capacidade | Descrição |
|---|---|
| Agentes especializados | NEXUS geral + Sincronia, Pesquisa, Memória, Código, Planejamento, Crítica, Síntese, Execução e Comunicação, cada um com persona (área e estilo) injetada no system prompt (`server/nexus-multichat.ts`) |
| RAG por mensagem | A mensagem do usuário é vetorizada (`text-embedding-v3`); as notas mais relevantes da Super Memória (scores acima de 0.2) entram no contexto. Sem chave de embedding, cai para a busca textual (mesmo fallback das missões) |
| Provedor do usuário | A resposta usa o modelo/provedor configurado pelo usuário em Minha IA (OpenAI, Anthropic, Google, Groq, OpenRouter, Ollama, QwenCloud, custom ou Forge embutido) |
| Memória contínua | Perguntas e respostas são registradas na Super Memória (origem `chat`, tags `chat` + agente), alimentando o RAG das próximas conversas; cada interação também gera um evento no feed cognitivo |
| Janela de contexto | Os últimos 10 turns da sessão são enviados ao LLM, mantendo a conversa coerente sem inflar o contexto |

### Configuração

Nenhuma variável nova é necessária: o chat reutiliza `QWEN_API_KEY` (embeddings) e as preferências de LLM armazenadas em `userLlmSettings`. Testes: `server/nexus-multichat.test.ts` (LLM, banco e embeddings mockados, 7/7 passando).

## Fase 19: Webhooks interativos, modo offline e chat em streaming

Três frentes de amadurecimento operacional: teste manual de webhooks, funcionamento offline de dados recorrentes e respostas ao vivo no chat multiagente.

| Capacidade | Descrição |
|---|---|
| Webhook manual (`webhooks.testFire`) | Botão "Testar" no diálogo de webhooks da missão dispara um payload de exemplo (`event: webhook.test`, com `payload.test: true` e metadados da missão) ao endpoint externo; grava `lastStatus`/`lastTriggeredAt` visíveis na UI e retorna `elapsedMs` |
| Fail-fast 5s | O disparo de webhook e `notifyOwner`/`sendEmail` usam `AbortSignal.timeout(5000)`: endpoints lentos não travam o sistema — falha em no máximo 5s com `lastStatus: 0` |
| Chat em streaming (SSE) | Novo endpoint `/api/chat/ask-stream` (texto/event-stream): autentica por cookie/Bearer, emite `context` (contagem de notas RAG), `chunk` (efeito de digitação, 8 chars/15ms) e `done` ({response, agentName}); grava memória e feed em background. O frontend usa o streaming por padrão e cai automaticamente para o tRPC síncrono se o SSE falhar |
| Modo offline (PWA) | O service worker agora cacheia a Super Memória (30 min) e o Feed Cognitivo (10 min) além das missões (5 min); consultas GET são servidas do cache com header `x-nexus-offline` quando não há rede, e o app exibe indicador online/offline |
| Robustez do dev | Em modo de desenvolvimento o SW residual e os caches antigos do PWA são removidos ao carregar a página, eliminando o "Invalid hook call" por duplicidade do React |

### Configuração

Nenhuma variável nova. Testes: `server/nexus-webhooks-f19.test.ts` (5/5, incluindo o contrato fail-fast de 5s) e `pnpm test` completo com 120/122 (2 falhas externas por cota 412 do LLM de teste).

## Fase 20: Monitoramento de webhooks, streaming nativo e alerta de cota LLM

Três frentes de observabilidade e desempenho: histórico de disparos de webhooks por missão, streaming real via Forge API no chat e orientação clara quando a cota do LLM embutido se esgota.

| Capacidade | Descrição |
|---|---|
| Histórico de disparos (`webhook_events`) | Nova tabela registra **todo** disparo — automático (`fireMissionWebhooks`) ou manual (`testFire`) — com `result` (`sucesso`/`falha`/`timeout`/`teste`), `httpStatus`, `elapsedMs`, `errorMessage` e payload; procedimento `webhooks.listEvents` com verificação de posse da missão |
| Painel de monitoramento | Cada webhook no diálogo de "Minha IA" exibe os últimos disparos: chip de resultado colorido, código HTTP, tempo de resposta e mensagem de erro quando houver; disparar um teste atualiza o histórico automaticamente |
| Streaming nativo (`sendChatStream`) | O SSE `/api/chat/ask-stream` agora usa o streaming real da Forge API (`stream: true`, deltas SSE por linha `data:`); provedores externos continuam com chunking sintético e o fallback tRPC permanece |
| Alerta de cota (412) | Quando o upstream retorna 412 ("usage exhausted"), o stream emite o evento `quota` com orientação de configuração em Config (OpenAI, Anthropic, Groq, QwenCloud ou Ollama); a bolha do chat exibe fundo âmbar com "⚠ limite do LLM exaurido", sem cair no fallback tRPC (que repetiria o mesmo erro) |

### Configuração

Nenhuma variável nova. Testes: `server/nexus-webhooks-f20.test.ts` (7/7: registro de eventos, classificação de timeout, ownership, detecção de 412, parsing de SSE real com `ReadableStream` e erro não-2xx) e `pnpm test` completo, com apenas as 2 falhas externas conhecidas por cota 412 do LLM de teste.

## Fase 21: Retransmissão automática de webhooks, streaming nativo de provedores externos e métricas

Robustez de integrações (retry com backoff exponencial), streaming real para todos os provedores de LLM e um painel completo de métricas de disparos.

| Capacidade | Descrição |
|---|---|
| Retry com backoff | Novo helper compartilhado `postWebhookWithRetry` (1ª tentativa + até 2 retransmissões com backoff exponencial de 1s → 2s; máximo 3 tentativas). Apenas falhas transitórias são retentadas: 5xx, timeout e rede — erros 4xx são definitivos e registrados sem retry |
| Coluna `attempts` | A tabela `webhook_events` ganhou `attempts` (padrão 1); todo disparo grava quantas tentativas foram feitas, e a UI exibe o ícone de retentativa quando `attempts > 1` |
| Streaming nativo externo | `sendStreamWithProvider` (nexus-multillm) implementa SSE real para OpenAI/Groq/OpenRouter/Qwen (formato compat com OpenAI) e Anthropic (SSE nativo); o SSE do chat (`/api/chat/ask-stream`) roteia: Forge → `sendChatStream`, demais → `sendStreamWithProvider`; fallback sintético permanece para provedores sem SSE ou sem chave |
| Métricas de webhooks | Novo procedimento `webhooks.metrics` (posse validada) retorna `total`, `successRate`, `countsByResult`, `avgElapsedMs`, `recentFailures` e agregação `byDay`; o painel `/webhooks` exibe KPIs, gráfico de barras por dia, falhas recentes e tabela de eventos, com filtros por missão e janela de dias |
| Badge de cota LLM | `QuotaAlertContext` + `QuotaBadge` no cabeçalho global: qualquer página pode disparar o alerta (o chat já dispara no evento `quota`); badge âmbar "LLM EXAURIDO" leva direto a `/config` para trocar de provedor |

### Configuração

Nenhuma variável nova. Testes: `server/nexus-webhooks-f21.test.ts` (8/8: backoff 500→falha completa, sucesso na 2ª tentativa, 4xx definitivo, rede com ECONNRESET, métricas por dia, SSE OpenAI-compat e evento `quota` 412) e `pnpm test` completo, com apenas as 2 falhas externas conhecidas por cota 412 do LLM de teste (`server/nexus.test.ts`).

## Fase 22: Loterias NEXUS — análise estatística com dados oficiais da Caixa

Sistema preditivo-cognitivo estatístico para as loterias brasileiras, consumindo diretamente a API pública da Caixa Loterias (sem token), com coleta agendada diária via Heartbeat.

| Capacidade | Descrição |
|---|---|
| Fonte de dados | API pública `servicebus2.caixa.gov.br/portaldeloterias/api/{loteria}/{concurso}` (Mega-Sena, Quina, Lotofácil, Lotomania e Timemania) — sem chave e sem token |
| Coleta resiliente | `collectAndPersist` com retry (3 tentativas, backoff exponencial), rate-limit de 1s entre requisições e dedup por `(loteria, concurso)` via índice único `uq_lottery_draw` na tabela `lottery_draws` |
| Detecção do último concurso | O endpoint `/0` da Caixa é instável no sandbox (500 intermitente); `findLatestDrawNumber` usa **busca binária** sobre o intervalo de concursos para localizar o último com precisão |
| Estatísticas | `computeStats`: frequência por dezena, atraso (draws desde a última aparição), quentes/frias/delayed (top 10), pares de dezenas mais comuns e contagem de sorteios acumulados no período |
| Gerador estatístico | `generateStatisticalBet` pondera dezenas quentes (40%), em atraso (30%) e aleatórias (30%) com PRNG determinístico (mulberry32, seed = `Date.now() + i`) — acompanhado de disclaimer explícito de aleatoriedade |
| Atualização diária | Callback heartbeat `/api/scheduled/loterias-collect` (14:05 UTC / 11h BRT) atualiza os 5 sorteios mais recentes de cada loteria; o cron é criado na plataforma com `manus-heartbeat create` |
| Frontend `/loterias` | Seletor de loteria, KPIs (sorteios coletados, último concurso, prêmio estimado, acumulados), últimos sorteios com dezenas coloridas, gráficos de frequência (BarChart) e atraso (LineChart) via Recharts, pares comuns, listas quentes/frias/em atraso e gerador de apostas com diálogo |

Aviso: a análise é **puramente estatística descritiva** — sorteios de loteria são aleatórios e nenhuma estatística aumenta a probabilidade matemática de acerto. O módulo exibe esse disclaimer na UI.

### Configuração

Nenhuma variável nova. Testes: `server/nexus-loterias.test.ts` (18/18: validação de dezenas por loteria, frequência, atraso, pares comuns, acumulados, PRNG determinístico e limites do gerador) e `pnpm test` completo, com apenas as 2 falhas externas conhecidas por cota 412 do LLM de teste (`server/nexus.test.ts`).

## Fase 23: Loterias NEXUS — conferência de apostas, alertas de acumulado e chat com dados oficiais

Evolução do módulo de loterias: o usuário agora salva suas apostas, confere automaticamente os acertos contra os concursos coletados, recebe notificações de acumulados que ultrapassam um limiar configurável, e o chat multiagente usa as estatísticas oficiais como fonte de dados.

| Capacidade | Descrição |
|---|---|
| Apostas salvas | Tabela `lotteryBets` (user, loteria, concurso, dezenas, hits, checked). Concurso `0` = conferir contra o concurso mais recente quando for coletado |
| Conferência automática | O callback diário `/api/scheduled/loterias-collect` confere todas as apostas pendentes da loteria recém-coletada (`checkBetHits`) e marca `checked=1`; a página `/loterias` também confere as pendentes ao abrir (`listBets`) |
| Notificação de acertos | Acertos com 4+ dezenas disparam notificação in-app ao dono da aposta via `notifyOwner` |
| Alertas de acumulado | Tabela `lotteryAlerts` (user, loteria, limiar em BRL, `lastNotifiedDraw`). Avaliados a cada coleta diária; notificação quando o acumulado atual (ou o próximo estimado, se acumulado zerado) ultrapassa o limiar; antirrepetição por concurso via `lastNotifiedDraw` |
| Chat com dados oficiais | `multiAgentChat` detecta perguntas sobre loterias (`isLotteryRelated`) e injeta `buildLotteryStatsContext` (frequência, atraso, pares, acumulados e últimos sorteios) no system prompt do agente, junto do RAG da Super Memória |
| Frontend `/loterias` | Painel "Alertas de acumulado" (badges com valor, configurar/remover) e painel "Minhas apostas" (status aguardando conferência / N acertos); botão "Salvar aposta" nas apostas geradas |

Aviso: a análise é **puramente estatística descritiva** — sorteios são aleatórios e nenhuma análise aumenta a probabilidade de acerto. O disclaimer permanece visível na UI e também é injetado no contexto do chat.

### Configuração

Nenhuma variável nova. Testes: `server/nexus-loterias.test.ts` (26/26: inclui conferência de apostas, `parseBRL`, avaliação de alertas de acumulado, detecção de perguntas sobre loterias e contexto do chat) e `pnpm test` completo, com apenas as 2 falhas externas conhecidas por cota 412 do LLM de teste (`server/nexus.test.ts`).

## Fase 24: Loterias NEXUS — acertos pessoais, missões e exportação de apostas

A Fase 24 completa o ciclo do módulo de Loterias com três melhorias: histórico pessoal de acertos, missões agendadas sobre os dados oficiais e exportação/compartilhamento de apostas.

| Capacidade | Descrição |
|---|---|
| Histórico de acertos pessoais | `loterias.betStats` (`listCheckedBetsWithDraws` em `server/db.ts`): join entre `lotteryBets` e `lotteryDraws` das apostas conferidas, com série temporal e resumo por loteria (apostas, total de acertos, recorde de hits). O frontend exibe gráfico de linha (Recharts) na seção "Meus acertos" |
| Template de missão de loterias | "Relatório de Loterias" adicionado ao `MISSION_TEMPLATES_SEED` (categoria `loterias`, ícone `Ticket`), com inserção idempotente na produção — permite agendar no planner missões que consultam as estatísticas oficiais |
| Copiar dezenas (lotérica) | Botão "Copiar dezenas" gera texto em formato de lotérica (`Loteria: ...\nDezenas: 03 - 07 - ...`); o array original não é mutado (`slice()` antes de `sort()`) |
| Compartilhar aposta | "Compartilhar" gera código base64url versionado (`app=nexus v=1 kind=lottery-bet`); o botão "Importar aposta" abre o diálogo que cola o código e salva a aposta via `loterias.importBet` — ela será conferida automaticamente quando o concurso sair |
| Exportação (`exportBet`) | Procedimento tRPC que retorna o código base64url da aposta salva, com validação de posse |

Aviso: a análise é **puramente estatística descritiva** — sorteios de loteria são aleatórios e nenhuma estatística aumenta a probabilidade matemática de acerto.

### Configuração

Nenhuma variável nova. Testes: `server/nexus-loterias.test.ts` (32/32: round-trip do código base64, formatação de dezenas e estatísticas pessoais) e `pnpm test` completo, com apenas as 4 falhas externas conhecidas por cota 412 do LLM de teste (`server/nexus.test.ts`).

## Fase 25: Loterias NEXUS — coleta histórica completa, modelo LSTM e filtro por período
A Fase 25 evolui o módulo de Loterias com três capacidades preditivas: coleta do histórico completo de concursos diretamente da Caixa, estatísticas filtradas por período e um modelo de rede neural LSTM treinado por loteria.
| Capacidade | Descrição |
|---|---|
| Coleta histórica completa | `loterias.collectHistory` cria um job assíncrono (tabela `lotteryCollectJobs`: 500 concursos Quina/Lotofácil, 300 Mega-Sena/Lotomania/Timemania) que baixa do último concurso até a meta com rate-limit de 1s, retry com backoff e dedup. O progresso aparece em tempo real na página `/loterias` (`listCollectJobs`, atualiza a cada 5s) |
| Filtro de período | `loterias.stats` aceita `period: 30\|60\|90\|all`; o helper `drawsWithinDays` filtra por data do concurso e recalcula frequência, atraso, quentes/frias sobre a janela — chips de período no cabeçalho da página |
| Modelo LSTM por loteria | Treinamento em JavaScript puro (sem dependência de Python em produção): LSTM 1 camada oculta + saída densa, backpropagation por tempo (BPTT) sobre janelas de 10 concursos normalizadas. `startLstmTraining` roda em background, salva os pesos no S3 (`nexus-lstm/{type}.json`) e registra épocas/loss na tabela `lottery_models`. Inferência manual em Node lê os pesos do S3; sem modelo pronto, a aposta usa o método estatístico de frequência/atraso com aviso explícito |
| Apostas LSTM | `loterias.lstmBet` retorna dezenas preditas com método (`lstm`, `blend` ou `estatístico`), confiança 0..1 e botão "Salvar aposta" integrado ao fluxo de conferência automática |
Aviso: a análise é **puramente estatística e probabilística** — sorteios de loteria são aleatórios e nenhum modelo (incluindo o LSTM) aumenta a probabilidade matemática de acerto.
### Configuração
Nenhuma variável nova. Testes: `server/nexus-loterias.test.ts` (42/42: filtro de período, dataset LSTM, épocas de treinamento, inferência determinística, blend LSTM+estatístico) e `pnpm test` completo.
