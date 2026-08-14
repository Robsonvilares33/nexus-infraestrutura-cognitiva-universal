# NEXUS — Infraestrutura Cognitiva Universal

Plataforma cognitiva open source que transforma **missões** em realidade através de um ecossistema distribuído de inteligências artificiais: agentes especializados, ferramentas de computador, memória persistente e modelos de IA intercambiáveis. Não é um chatbot — é um universo cognitivo vivo.

> **Open source**: qualquer pessoa pode baixar este repositório e rodar no próprio computador. O guia completo está em [`docs/LOCAL-SETUP.md`](docs/LOCAL-SETUP.md).

## Arquitetura

React 19 · Tailwind 4 · Express 4 · tRPC 11 · Drizzle ORM (MySQL/TiDB) · SSE (Server-Sent Events) · Vitest. O executor de agentes roda no servidor (`server/nexus-agent.ts`) e segue o padrão **think-act-observe** inspirado na arquitetura de agentes da Manus: o modelo pensa, escolhe uma ferramenta, observa o resultado e repete, com limite de iterações e fallback por síntese.

## Módulos da plataforma

| Módulo | Descrição |
|---|---|
| Universo 3D | Visualização fractal do ecossistema com Three.js |
| Missões (Fase 13) | Loop agente autônomo NEXUS × Manus com console ao vivo (SSE + polling de fallback), ferramentas `search_memory`, `save_memory`, `ask_agent`, `finish` |
| Computer Tools (Fase 14) | O agente executa `run_shell`, `read_file`, `write_file`, `edit_file`, `list_dir`, `web_fetch` com sandbox de segurança (workspace isolado, bloqueio de comandos perigosos, timeout 120s) — mesmo conjunto conceitual do Claude Code / OpenClaw |
| Super Memória (Fase 14) | Cofre de notas estilo Obsidian: Markdown infinito, pastas, tags, links `[[nota]]`, busca — o agente grava descobertas automaticamente a cada missão |
| Motor de IA aberto (Fase 14) | Qualquer provedor: Manus Forge (padrão), OpenAI, Anthropic, Google Gemini, Groq, OpenRouter, QwenCloud, Ollama local, ou qualquer servidor OpenAI-compatível (vLLM, LM Studio) |
| Memória | Banco de memória com busca semântica via LLM e identidade unificada por usuário |
| Marketplace | Plugins da comunidade com avaliação, threads aninhadas e verificação automática de código (5 testes: credenciais, sintaxe, exportação, tamanho, fonte) |
| Projetos compartilhados | Convites, chat ao vivo por projeto e missões sincronizadas em tempo real |
| Conquistas & Leaderboard | Gamificação: 8 badges, XP por contribuição (+50 plugin, +20 missão, +10 review, +5 colaboração), top-20 |
| Reputação | Níveis Iniciante → Oráculo com progresso no Perfil |
| E-mails reais | Integração Resend para notificações |
| PWA & offline | Instalável no celular/desktop; service worker cacheia missões recentes para consulta offline |
| Notificações em tempo real | Push via Socket.io com toasts e central de notificações |
| Templates de Missão | 6 modelos prontos no Marketplace |
| Admin | Painel de administração (role `admin`), promoção de usuários, métricas |
| Indicador de conexão | Status CONECTADO/OFFLINE no cabeçalho |

## Rodar localmente

Requisitos: **Node.js 22+**, **pnpm**, **MySQL 8+ ou TiDB** (o TiDB Serverless é grátis em [tidbcloud.com](https://tidbcloud.com)), ~2 GB de disco. Roda em PCs modestos (i3 / 8–12 GB RAM), pois o peso da IA fica no provedor de modelo escolhido.

```bash
git clone https://github.com/Robsonvilares33/nexus-infraestrutura-cognitiva-universal.git
cd nexus-infraestrutura-cognitiva-universal
pnpm install
# crie seu banco e configure .env (modelo em docs/ENV-TEMPLATE.md)
pnpm drizzle-kit push
pnpm dev
```

Abra `http://localhost:3000`. Veja os detalhes em [`docs/LOCAL-SETUP.md`](docs/LOCAL-SETUP.md), incluindo autenticação sem OAuth Manus para uso pessoal.

## Usar qualquer modelo de IA

Em execução hospedada: **Config → Motor de IA** — escolha o provedor, cole a chave e (opcional) ative as ferramentas de computador e web.

Em execução local: `NEXUS_LLM_PROVIDER` no `.env` (aceita `forge | openai | anthropic | google | groq | openrouter | ollama | qwen | custom`). Para modelos totalmente locais e offline, rode o [Ollama](https://ollama.com) e aponte `OLLAMA_BASE_URL`.

Provedores gratuitos para começar: **Groq** ([console.groq.com/keys](https://console.groq.com/keys)), **Google Gemini** ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)), **OpenRouter** ([openrouter.ai/keys](https://openrouter.ai/keys)), **Ollama local** ([ollama.com/download](https://ollama.com/download)).

## Testes

```bash
pnpm test
```

Vitest cobre rotas tRPC, validação de plugins, colaboração, threads, XP, reputação, templates, o loop agente (unit + integração com LLM real e banco real) e validação live de chaves de provedores externos — 60+ testes passando.

## Publicar

O código é portátil: GitHub Pages (build estático), qualquer servidor com Node 22, ou hospedagem nativa Manus (botão **Publish** na interface, com domínio customizado).
