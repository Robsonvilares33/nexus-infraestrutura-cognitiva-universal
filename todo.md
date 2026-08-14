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

## Phase 12 (sugestões futuras)
- [ ] Streaming real do feed cognitivo para execução de missões agendadas
- [ ] Busca semântica vetorial (embeddings) na Memória
- [ ] Compartilhamento de missões entre usuários (exportar/importar)
