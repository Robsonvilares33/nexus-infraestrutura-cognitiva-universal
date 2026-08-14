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
