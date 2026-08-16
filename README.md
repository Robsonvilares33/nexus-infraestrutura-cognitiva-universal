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
