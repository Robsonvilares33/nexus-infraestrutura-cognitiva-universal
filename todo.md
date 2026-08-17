# NEXUS — Project TODO

## Core Infrastructure
- [x] Cyberpunk dark theme (#020308) with Space Grotesk + JetBrains Mono fonts
- [x] NEXUS color palette: cyan (#7cf3ff), purple (#c9b8ff), gold (#ffd479)
- [x] Database schema (plugins, models, agents, projects, missions, memory, cognitiveFeed, universeSettings)
- [x] Database migration applied
- [x] tRPC routers for all features (dashboard, universe, plugins, models, agents, projects, missions, memory, feed)
- [x] LLM integration for mission execution
- [x] Auto-seed on first login (plugins, models, agents)
- [x] NexusLayout with cyberpunk sidebar navigation

## Pages
- [x] Home — Dashboard with stats, hero banner, quick access, cognitive feed
- [x] Universo — Three.js 3D visualization (agents in K9 graph, memory layers, particles, stars)
- [x] Minha IA — Mission input, cognitive feed, mission history
- [x] Plugins — Model/Infra/Device categories, connect/disconnect, add new
- [x] Agentes — 9 specialized agents with model assignment
- [x] Modelos — Ecosystem models + available LLM models
- [x] Memoria — 4-tier memory system (Ativa, Relevante, Histórica, Arquivada)
- [x] Projetos — Create/list/manage projects
- [x] Config — User profile, universe settings, initialize ecosystem
- [x] Status — Architecture health monitoring (8 modules, topology)
- [x] Docs — NEXUS documentation with 5 sections

## Mission System
- [x] Mission creation from natural language
- [x] LLM interpretation (goal, complexity, specialties, plan)
- [x] Subtask orchestration with agent assignment
- [x] Agent execution with feed events
- [x] Result synthesis and confidence scoring
- [x] Memory storage from mission results

## Tests
- [x] Write vitest tests for key procedures (12 tests passing)
- [x] Auto-seed ecosystem on dashboard load (auto-populates plugins, models, agents)
- [x] GitHub tool validation section added to Plugins page

## Advanced Features (Phase 2)
- [x] Real-time streaming for cognitive feed (WebSocket/SSE)
  - socket.io server integrated into express
  - MinhaIA page connects to WebSocket for live events
  - feed events broadcast in real-time during mission execution
- [x] Semantic memory search using LLM-powered semantic matching
  - memory.search endpoint uses LLM to find relevant memories
  - Busca Semântica button added to Memoria page
- [x] Collaboration panel for shared projects
  - projectShares table created
  - share/getShares/sharedWithMe/removeShare endpoints
  - Share button added to Projetos page

## Phase 3 Features
- [x] Scheduled missions with Heartbeat/SSE
  - schedule/unschedule/listScheduled endpoints
  - /api/scheduled/mission-{id} callback endpoint
  - DB columns: scheduleCronTaskUid, isScheduled
- [x] Push notifications for mission completion (both regular and scheduled)
- [x] Light/dark theme toggle (ThemeProvider switchable + button in header)

## Phase 4 Features
- [x] Analytics Dashboard with usage charts (missions/day, avg confidence, active agents)
- [x] Interactive Chat with agents (conversational interface)
- [x] Plugin Marketplace (share/discover community plugins)

## Phase 4 Follow-up Fixes
- [x] Add loading, error, and empty states to Analytics page; chart metrics render gracefully with no data
- [x] Clarify analytics agents metric (labeled "Agentes ativos (eventos de feed)")
- [x] Fix Chat: render assistant responses reliably from chat.send mutation return value (removed dependency on unemitted socket events) with shared pendingId so typing indicator is always replaced
- [x] Add vitest coverage for analytics.get and chat.send procedures (16 tests passing)
- [x] Fix rules-of-hooks violation in NexusLayout (hooks declared after early returns)
- [x] Fix analytics.get SQL result parsing (db.execute returns [rows, fields])

## Plugin Marketplace
- [x] Create marketplace_plugins table in drizzle schema (migration 0005 applied)
- [x] db.ts helpers (list, details, add, downloads, upvote, remove, install)
- [x] marketplace router (list/details/publish/upvote/install/remove)
- [x] Marketplace page UI (browse grid, search/category filters, publish dialog, install/upvote)
- [x] Marketplace in sidebar navigation and App.tsx route
- [x] Vitest coverage (5 new tests, 21 passing total)
- [x] Seed 5 community plugins for demonstration
- [x] Add listMine endpoint for user's published plugins
- [x] Add detail dialog view (description, source code, GitHub link, stats, remove for owner)
- [x] Fix Recharts PieChart invalid child (removed stray XAxis)
- [x] Mobile viewport verified for Analytics, Chat, Marketplace

## Phase 5 — Feedback & Administration
- [x] marketplace_reviews + marketplaceInstalls tables (migration 0006 applied)
- [x] db.ts helpers for reviews (add/dedupe/list/average rating) + admin helpers (users, roles, moderation, platform stats)
- [x] marketplace router: addReview / reviews; admin router (stats, listUsers, setRole, listPlugins, approvePlugin, deletePlugin) via adminProcedure
- [x] Reviews UI in Marketplace detail dialog (star selector, average, list, upsert per user)
- [x] Owner user promoted to admin; Admin page at /admin with stats, plugin moderation, user management
- [x] Admin nav item visible only to admins (sidebar, role-gated)
- [x] PDF report export in Analytics (jsPDF + html2canvas client-side, multi-page A4, fallback to print)
- [x] Vitest coverage for reviews and admin (26 tests passing)
- [x] TypeScript clean, tests 26/26, screenshots verified
- [x] Checkpoint + report

## Phase 6 — Profile, Semantic Search, Webhooks
- [x] userProfiles + missionWebhooks tables (migration 0007 applied)
- [x] db.ts helpers: profile get/upsert, history (missions, plugins, mp installs, reviews, shares), webhooks CRUD + fire (POST JSON on completion)
- [x] Routers: profile.get/update/history; webhooks.add/list/remove; missions.execute fires webhooks fire-and-forget
- [x] Profile page UI (bio, avatar URL, accent color, history cards)
- [x] Profile nav item + /profile route
- [x] Marketplace semantic search (gpt-5-mini term expansion + SQL OR LIKE, approved-only, SEMÂNTICA toggle UI)
- [x] Webhook management UI in MinhaIA mission cards (add/remove, HTTP status chips)
- [x] Vitest coverage for profile and webhooks (31 tests passing)
- [x] TypeScript clean, screenshots verified (/profile, /marketplace, /minha-ia)
- [x] Checkpoint + report

## Phase 7 — Email Notifications, Dynamic Categories, Admin Growth Dashboard
- [x] Platform notifications for mission completion (notifyOwner in missions.execute + scheduled heartbeat callback; platform channel targets project owner — no per-user email API available)
- [x] Platform notification when a plugin receives a new review (notifyOwner in marketplace.addReview)
- [x] User email field verified on users table (kept for future email integration)
- [x] suggestedCategories table (migration 0008 applied)
- [x] db helpers + router: suggest / listApproved / listPending / vote / admin.approveCategory / admin.deleteCategory / admin.listCategories
- [x] Marketplace publish Select + category filter include approved community categories
- [x] "Categorias da Comunidade" section in Marketplace (suggest + vote UI)
- [x] Admin growth dashboard: weeklyGrowthStats helper + ComposedChart (users/missions/plugins, 8 weeks)
- [x] Category moderation section in Admin page (approve/reject pending suggestions)
- [x] Vitest coverage (categories + admin growth, 36 tests passing)
- [x] TypeScript clean, screenshots verified (/admin, /marketplace), test categories cleaned from DB
- [x] Checkpoint + report

## Phase 8 — Notification Center, Real Email, Achievements — DONE
- [x] in_app_notifications table (migration 0009 applied)
- [x] db.ts helpers (addInAppNotification, listUserNotifications, markRead, markAllRead, countUnread)
- [x] notifications router + achievements router with progress
- [x] Notifications + Achievements pages, routes (/notificacoes, /conquistas) and nav items with unread badge
- [x] Real email via Resend (EMAIL_API_KEY set + validated; send returns 200; sandbox keys deliver to delivered@resend.dev)
- [x] email + achievements wired on mission completion and plugin review
- [x] 39 vitest tests passing, screenshots verified, checkpoint 03656618

## Phase 8 Gaps
- [x] achievements.markSeen procedure (seen state persistence + UI toast flow)
- [x] evaluateAchievements on plugin publish (first_plugin)
- [x] Vitest coverage for markSeen and publish-triggered unlock (41 tests passing)

## Phase 9 — Colaboração em Tempo Real, Plugins Verificados, PWA
- [x] projectCollaborations table (shared projects with role + mission visibility) + collaboration_messages for real-time discussion
- [x] plugin_verifications table (automated validation: build/lint/syntax check results) + verification fields on marketplace_plugins
- [x] Backend: collaborate invite/accept, shared feed socket room, verify plugin job (syntax + structural checks)
- [x] PWA: manifest.json, service worker, icons, installable on mobile
- [x] Frontend: Colaboração tab in Projetos (invite, accept, shared mission list, chat in shared project)
- [x] Frontend: Selo "Verificado" in Marketplace cards/details with verification status
- [x] Vitest coverage for collaboration + verification (48/48 tests passing) flows
- [x] Screenshots verified, checkpoint + report

## Phase 10 — Threads em Plugins, Leaderboard XP, Cache Offline PWA — DONE
- [x] pluginThreads + xp_events tables (migration 0012 applied)
- [x] Backend: thread create/reply/list (aninhado), award XP on publish/review/collab, leaderboard query
- [x] XP ganho por: publicar plugin (+50), review (+10), missão concluída (+20), colaboração aceita (+5)
- [x] Frontend: seção Discussão no detalhe do plugin com respostas aninhadas
- [x] Frontend: página /leaderboard com ranking XP (top-20 + meu XP)
- [x] SW cache offline de missões recentes (nexus-missions-v1)
- [x] Vitest coverage (50/50 tests passing) + screenshots + checkpoint eee9251a + GitHub sync

## Phase 11 — Reputação de Perfil, Notificações em Tempo Real, Templates de Missão
- [x] Sistema de níveis de reputação (XP thresholds -> badges: Iniciante, Explorador, Arquiteto, Mago, Lenda) em db.ts + helper
- [x] Socket.io: broadcast in-app notification events (notificação:push) no createInAppNotification
- [x] Templates de missão: tabela mission_templates (título, descrição, inputSugerido, agentes, categoria) + seed + roteador marketplace.publishTemplate/listTemplates/useTemplate
- [x] Frontend: nível de reputação no Perfil e sidebar (barra XP + próximo nível)
- [x] Frontend: notificações push ao vivo sem recarregar (socket listener na página Notificações)
- [x] Frontend: aba Templates no Marketplace com botão "Usar template" que preenche Minha IA
- [x] Vitest coverage (nível de reputação + templates + socket) + screenshots + checkpoint + GitHub sync
- [x] Limpeza de dados de teste vitest (plugins, notificações, xp_events, threads, reviews, colaborações, projetos, missões)
- [x] README.md atualizado com Reputação, Notificações em tempo real, Templates de Missão e Indicador de conexão

## Backlog de sugestões futuras (aguardando aprovação do usuário)
- [x] Backlog aprovado: streaming real do feed cognitivo para missões agendadas — implementado na Fase 13 (SSE ao vivo no console do agente; missões agendadas notificam por email/push)
- [x] Backlog aprovado: busca semântica vetorial (embeddings) na Memória — implementado na Fase 15 (QwenCloud text-embedding-v3, busca com scores + fallback textual BM25)
- [x] Backlog aprovado: compartilhamento de missões entre usuários (exportar/importar) — fase futura

## Phase 11 Follow-up
- [x] Testes agora se autolimpam (afterEach/afterAll removem entradas vitest do cognitiveFeed) — 54/54 passando
- [x] Sincronização final com o GitHub (commit a5279bd)
- [x] Correção de UI: role admin recém-promovido não via Admin na sessão (cache de auth.me) — useAuth agora refetch em focus/reconnect (staleTime 30s) + refreshMe(); backend sempre lê role do DB (verificado)

## Auditoria solicitada (14/08)
- [x] Verificar sincronização completa com o GitHub (arquivos, commits) — 190/191 arquivos locais no remote; único ausente é .session-notes.md (intencional, contém credenciais)
- [x] Teste de estresse como usuário: fluxo completo de missão
- [x] Teste de estresse como usuário: plugins, agentes, modelos, memória, universo 3D
- [x] Teste de estresse como usuário: marketplace, templates, threads, XP
- [x] Teste de estresse como usuário: projetos/colaboração, notificações, conquistas, admin
- [x] Bug corrigidos na auditoria: DataTooLong (confidence arredondado) + missões travadas (try/catch → status=failed) + unificação de identidade (3 contas → 1020001)
- [x] Relatório de avaliação + guia de uso + possibilidades (relatorio-auditoria-nexus.md entregue)

## Fase 13: Fusão NEXUS + Manus (arquitetura fundida)
- [x] Analisar arquitetura interna do Manus (agente loop, ferramentas, streaming, contexto) e mapear conceitos fundíveis
- [x] Backend: executor agente em loop iterativo com subtarefas dinâmicas acionáveis
- [x] Backend: planejamento adaptativo a falhas (erros persistidos como observações no contexto, o modelo se adapta e tenta outro caminho; fallback por síntese ao esgotar iterações)
- [x] Backend: memória de contexto persistente entre etapas da missão (context window compacta) — seeds memória ativa + compressão >16 msgs
- [x] Backend: streaming real de eventos (SSE + polling de fallback) substituindo polling síncrono
- [x] Frontend: console de agente com stream ao vivo e progresso iterativo (Modo Agente em Minha IA) — observabilidade em tempo real dos tool calls/resultados
- [x] Teste de estresse da arquitetura fundida — 60/60 vitest incl. teste live; fast-fail verificado
- [x] Sincronizar GitHub

## Fase 14: Ferramentas de Computador, Super Memória, Multi-Modelo e Open Source
- [x] Ferramentas de computador com sandbox (run_shell, read_file, write_file, edit_file, list_dir, web_fetch) — 11 testes
- [x] Super Memória (vault estilo Obsidian): CRUD de notas, pastas, tags, links [[ ]] clicáveis — 5 testes
- [x] Super Memória integrada ao loop do agente (agente grava descobertas) — teste de integração
- [x] Motor multi-modelo (9 provedores: Forge, OpenAI, Anthropic, Google, Groq, OpenRouter, Ollama, QwenCloud) — validação live com QwenCloud
- [x] Seletor de motor de IA na UI (Minha IA) com persistência por usuário (userLlmSettings)
- [x] Docs open-source: docs/LOCAL-SETUP.md, docs/ENV-TEMPLATE.md, README reescrito
- [x] Sincronização GitHub: PR #2 mergeado, main em 382b06e, sem segredos reais no repositório
- [x] Limpeza do feed cognitivo: deduplicação de erros temporários, remoção de 100 entradas de teste de estresse
- [x] 75/77 vitest passando (2 testes live de LLM bloqueados por cota exaurida da API embutida — erro externo transitório)
- [x] Relatório final de uso e possibilidades entregue

## Fase 15: RAG, Embeddings e Ponte Neural SIAOL
- [x] Embeddings: coluna embedding (BLOB 4KB) + embeddingUpdatedAt na superNotes; gerados via QwenCloud text-embedding-v3 (dim 1024) com LRU cache
- [x] Backend: server/nexus-embeddings.ts (geração, cosseno, fallback textual BM25) + db.ts semanticSearchSuperNotes (cosseno em memória)
- [x] Router: superNotes.semanticSearch({query, folder}) com scores + reindexEmbedding + availability
- [x] RAG no agente: tool memory_search + injeção das notas relevantes no contexto inicial da missão
- [x] UI SuperMemoria: busca semântica (toggle na barra de busca, badges de pontuação)
- [x] Plugin Ponte Neural SIAOL: seed no marketplace_plugins (canal symbiosis + metadados)
- [x] Tool do agente symbiosis_post (canal symbiosis, Manus-01)
- [x] Vitest (embeddings unit, semantic mock, RAG tool) — 23 novos testes, 100 total
- [x] LOCAL-SETUP/ENV-TEMPLATE atualizados (QWEN_API_KEY opcional para embeddings, SIAOL_BRIDGE_URL/_TOKEN)
- [x] Sync GitHub (PR #3 mergeado em c3e85bd) + checkpoint b9864088 publicado
- [x] Handshake com a Ponte Neural SIAOL testado ao vivo (GET + POST com Bearer)

## Fase 16: Compartilhamento de Missões (exportar/importar)
- [x] Backend: endpoints missions.exportMission (código base64url com input/título/resultado/confiança, payload versionado app=nexus v1) e missions.importMission (validação + cria missão do usuário, limite 5000 chars)
- [x] Frontend: botão Exportar nos cartões de missão da Minha IA (copia código p/ área de transferência) + botão Importar na barra de criação (dialog com textarea)
- [x] Vitest coverage (export + import com validação de payload) — 110 testes, 108 passando (2 por cota externa 412) + checkpoint + GitHub sync

## Fase 17: Validação E2E e simbiose SIAOL
- [x] Teste ponta a ponta exportar/importar de missões (browser: exportar missão completada → colar código → importar; UI completa)
- [x] Dialogar com Antigravity/MiniMax via Ponte Neural SIAOL (GET mensagens + POST avaliação colaborativa como Manus-01)
- [x] Registrar avaliações e melhorias propostas na Super Memória (nota com embedding via QwenCloud)
- [x] Melhorias aplicadas: SW apenas em produção + guard de reload no dev (fim do "Invalid hook call"); addMemory gera embedding na criação (RAG garantido para notas do agente); README com Fase 17; vitest 57/57; sync GitHub (PR #4)

## Fase 18: Chat Multiagente ao Vivo
- [x] Backend: módulo nexus-multichat + chat.multiAgent (9 agentes com persona; histórico de sessão; registro em memória e feed)
- [x] Backend: injeção de contexto da Super Memória relevante (RAG vetorial + fallback textual) no prompt do chat multiagente
- [x] Backend: resposta síncrona por tRPC (validada E2E; SSE de missões já cobre o feed cognitivo)
- [x] Frontend: página /chat-multiagente com seletor de agente, histórico da sessão e toggle Super Memória
- [x] Vitest coverage para o chat multiagente (nexus-multichat.test.ts, 7/7)
- [x] Sync GitHub (PR #7) + checkpoint publicado

## Fase 19: Webhooks interativos, modo offline e chat em streaming
- [x] Backend: webhooks.testFire (disparo manual de payload de exemplo ao endpoint externo; grava lastStatus/lastTriggeredAt; verificação de propriedade; falha com lastStatus=0 se endpoint não responder)
- [x] Backend: fail-fast 5s (AbortSignal.timeout) em testFire, fireMissionWebhooks, notifyOwner e sendEmail — endpoints lentos não travam o sistema
- [x] Backend: SSE /api/chat/ask-stream (autentica cookie/Bearer; emite context/chunk/done; chunks sintéticos 8 chars/15ms; registro de memória+feed em background)
- [x] Frontend: chat multiagente com streaming SSE (efeito de digitação; bolha sai do "pensando..." no primeiro chunk; fallback tRPC automático; toggle Streaming; indicador online/offline)
- [x] Frontend: SW offline — Super Memória 30 min (nexus-memory-v1) + Feed 10 min (nexus-feed-v1) + header x-nexus-offline
- [x] Frontend: guard dev remove SW residual e limpa caches do PWA (fim definitivo do "Invalid hook call")
- [x] Frontend: Minha IA — botão Testar webhook + exibição de último disparo (HTTP + timestamp)
- [x] Vitest coverage (nexus-webhooks-f19.test.ts, 5/5 incluindo fail-fast 5s) — 120/122 passando (2 cota externa 412)
- [x] README.md com seção Fase 19
- [x] Sync GitHub (branch sync-fase19b + PR #8 aberto em https://github.com/Robsonvilares33/nexus-infraestrutura-cognitiva-universal/pull/8; produção verificada 200, SSE endpoint exige autenticação 401 conforme esperado)

## Fase 20: Monitoramento de Webhooks, streaming nativo e alerta de cota LLM
- [x] Backend: tabela webhook_events (disparos por missão/webhook com status, tempo de resposta, duração, payload resumo, erro)
- [x] Backend: fireMissionWebhooks e testFire registram cada disparo em webhook_events
- [x] Backend: procedimento webhooks.listEvents({missionId, webhookId?}) com paginação
- [x] Backend: streaming nativo via Forge API no chat multiagente (endpoint de streaming real, sem chunks sintéticos)
- [x] Backend: detectar erro 412 (cota LLM) e registrar flag no SSE (type=quota) para o frontend
- [x] Frontend: painel de monitoramento de webhooks em Minha IA (histórico de disparos com chips de status, tempo de resposta, timestamp)
- [x] Frontend: chat multiagente com streaming real (mantém fallback tRPC)
- [x] Frontend: alerta de cota LLM (banner/toast 412 com orientação: trocar provedor em Config ou configurar chave própria)
- [x] Vitest coverage da Fase 20 (registro de eventos + detecção 412)
- [x] README.md e todo.md com seção Fase 20
- [x] Sync GitHub (branch sync-fase20b + PR #9 aberto em https://github.com/Robsonvilares33/nexus-infraestrutura-cognitiva-universal/pull/9; PR #8 da Fase 19 mesclado em e67d1a9)

## Fase 21: Retransmissão de webhooks, streaming nativo de provedores externos e badge de cota
- [x] Backend: retry de webhooks falhos (falha/timeout ganham retry com backoff exponencial, máx 3 tentativas, registradas em webhook_events)
- [x] Backend: procedimento webhooks.metrics ({missionId?, periodo}) com taxa de sucesso, contagens por resultado e tempos médios
- [x] Backend: streaming nativo de provedores externos (OpenAI/Anthropic/Groq/Qwen) no sendChatStream quando o usuário escolhe outro provedor, mantendo fallback sintético
- [x] Frontend: página de métricas de webhooks com taxa de sucesso, gráfico de tempos e eventos recentes
- [x] Frontend: badge de cota LLM na barra superior (aparece após resposta 412, leva a Config)
- [x] Vitest coverage da Fase 21 (retry/backoff, metrics, streaming externo)
- [x] README.md e todo.md com seção Fase 21
- [x] Sync GitHub (branch sync-fase21b + PR #10 aberto em https://github.com/Robsonvilares33/nexus-infraestrutura-cognitiva-universal/pull/10; árvores HEAD == checkpoint b0399074, sem tokens)  e PR #9 mesclado Sync GitHub (branch sync-fase21b + PR #10)

## Fase 22: Loterias NEXUS — análise estatística com dados públicos da Caixa Loterias

- [x] Investigar fontes públicas gratuitas de resultados da Caixa (sem token) e validar acesso (servicebus2.caixa.gov.br)
- [x] Backend: schema `lottery_draws` (tipo, concurso, data, dezenas, acumulado, ganhadores) + índice e dedup (Migration 0019 aplicada; backfill inicial: 30 linhas, 6 sorteios recentes por loteria)
- [x] Backend: coletor de resultados (últimos 500 de Quina/Lotofácil, 300 de Mega-Sena/Lotomania, rate-limit 1s, retry com backoff; endpoint `/0` instável → busca binária do último concurso)
- [x] Backend: estatísticas (frequência, atraso, quentes/frias, pares comuns, acumulados) + procedimento tRPC (`loterias` router: list, counts, collectStatus, collect, stats, bet)
- [x] Backend: geração estatística de apostas (simulação ponderada freq/atraso/aleatório com PRNG determinístico — com disclaimer de aleatoriedade)
- [x] Frontend: página /loterias com seletor de loteria, KPIs (sorteios, último concurso, prêmio estimado, acumulados), últimos sorteios com dezenas, gráficos de frequência e atraso (Recharts), pares comuns, listas quentes/frias/em atraso e gerador estatístico de apostas com disclaimer
- [x] Vitest coverage da Fase 22 (estatísticas, validação de dezenas, geração de apostas — 18/18 testes passando)
- [x] README.md com seção Fase 22 (tabela de capacidades, coleta agendada, aviso estatístico)
- [x] Heartbeat diário criado na plataforma (task_uid 2Lj4n6k86t6tJerNN9xnqF, cron 14:05 UTC) e callback em produção validado (403 sem cookie cron = autenticação OK)
- [x] Sync GitHub: push direto bloqueado pelo GITHUB PUSH PROTECTION (GH013 — remote aceita apenas commits verificados); sincronização deve ser feita via Management UI (Settings → GitHub → Export code / card "Sincronizar esta prévia"), caminho validado nas Fases 15–21. Usuário orientado a usar o botão de sincronização para abrir o PR #11 da Fase 22

## Fase 23: Loterias NEXUS — conferência, alertas e missões preditivas

- [x] Schema: tabelas `lotteryBets` (userId, loteria, concurso previsto 0=mais recente, dezenas json, hits, checked) e `lotteryAlerts` (userId, loteria, limiar BRL, enabled, lastNotifiedDraw) — Migration 0020 aplicada
- [x] Backend: procedimentos tRPC de apostas (latestDraw, saveBet, listBets com auto-conferência, getAlerts, setAlert, removeAlert — protected)
- [x] Backend: conferência automática no collect diário (`/api/scheduled/loterias-collect` confere apostas pendentes e notifica in-app acertos ≥4 dezenas)
- [x] Backend: alerta de acumulado — limiar por loteria + notificação via notifyOwner quando acumulado (ou próximo estimado) ultrapassa o limiar, com antirrepetição por concurso
- [x] Backend: integração chat multiagente — `multiAgentChat` detecta perguntas de loteria (isLotteryRelated) e injeta buildLotteryStatsContext no system prompt
- [x] Frontend: painel "Minhas Apostas" na página /loterias (apostas salvas, hits conferidos, badge aguardando conferência) + botão "Salvar aposta" nas geradas
- [x] Frontend: configuração de alerta de acumulado (painel com badges de limiar, dialog com Input, remover)
- [x] Vitest coverage da Fase 23 (26/26 em nexus-loterias.test.ts: conferência, parseBRL, avaliação de alertas, isLotteryRelated, contexto do chat)
- [x] README.md com seção Fase 23 (tabela de capacidades + aviso estatístico + testes)
- [x] Checkpoint salvo (acf40fc3, auto-published em nexuscogni-bvvqkune.manus.space); sincronização GitHub orientada via Management UI (Settings → GitHub / card "Sincronizar esta prévia"), pois o git push direto é bloqueado pelo GH013 (Push Protection — remote aceita apenas commits verificados)

### Progresso Fase 23 (contexto de retomada)
Feito até agora: Migration 0020 aplicada (tabela lotteryBets + lotteryAlerts no DB); schema.ts com lotteryBets (userId, lotteryType, drawNumber, numbers json, hits, checked) e lotteryAlerts (userId, lotteryType, thresholdBRL, enabled, lastNotifiedDraw); db.ts com helpers: insertLotteryBet, listLotteryBets, updateLotteryBet, listPendingBets, upsertLotteryAlert, listLotteryAlerts, updateLotteryAlert, deleteLotteryAlert (falta criar este último no db.ts); nexus-loterias.ts com checkBetHits, parseBRL, evaluateAccumulatedAlert; router loterias.ts com latestDraw, saveBet, listBets (auto-confere), getAlerts, setAlert, removeAlert (protectedProcedure).
Pendente: adicionar deleteLotteryAlert no db.ts (import de delete do drizzle-orm eq), integrar conferência+alerta no callback /api/scheduled/loterias-collect em server/_core/index.ts (importar notification API), integrar loterias como fonte no chat multiagente (ver server/routers.ts chat/agent), frontend painel Minhas Apostas + alertas em /loterias, vitest Fase 23 (testar engine puro + router com ctx mock), README, checkpoint, GitHub sync (Management UI Settings→GitHub; git push direto bloqueado por GH013 PUSH PROTECTION).
Notificação: usar sendOwnerNotification do server/_core/notification.ts (ver exports existentes).

### Progresso Fase 23 (retomada pós-compação — atualizar antes de checkpoint)
Backend 100%: Migration 0020 aplicada (lotteryBets + lotteryAlerts no DB); schema.ts OK; db.ts helpers OK (incl. deleteLotteryAlert com drizzleEq); nexus-loterias.ts com checkBetHits, parseBRL, evaluateAccumulatedAlert, buildLotteryStatsContext, isLotteryRelated; router loterias.ts com latestDraw/saveBet/listBets(getAlerts/setAlert/removeAlert); callback /api/scheduled/loterias-collect em server/_core/index.ts confere apostas + alerta acumulado com notifyOwner (import correto: ../../drizzle/schema). tsc limpo.
Frontend em andamento: Loterias.tsx — hooks de Fase 23 já adicionados (listBets, getAlerts, latestDraw, saveBet/setAlert/removeAlert mutations, handlers handleSaveBet/handleSetAlert/handleRemoveAlert, dialogs estados betDialogOpen/alertDialogOpen). FALTA: (1) JSX: seção "Minhas apostas" (tabela com hits), painel alertas (card com badges + botão "Alerta de acumulado" + dialog com Input), botão "Salvar aposta" nas apostas geradas (handleSaveBet), e (2) marcar itens todo.md, vitest Fase 23 (router mocks, engine puro), README, checkpoint, GitHub sync via Management UI (push direto bloqueado GH013).
Chat: integração feita em nexus-multichat.ts (multiAgentChat injeta lotteryContext via isLotteryRelated + buildLotteryStatsContext para megasena).
Nota: tsc watch log mostra erros antigos (module not found) — ignorar, cache do watcher.
