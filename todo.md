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
