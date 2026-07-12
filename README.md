# NEXUS - Plataforma Cognitiva Universal

Experiencia web para visualizar e operar um ecossistema cognitivo modular com missoes, agentes, modelos, plugins, memoria e universo 3D.

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
- `GET /api/plugins`
- `POST /api/plugins/:name/connect`
- `GET /api/memory`
- `POST /api/memory`
- `GET /api/missions`
- `POST /api/missions`

## Estado atual

Esta versao deixa a ideia funcionando como aplicacao web globalmente publicavel e como pacote local-first. Ja existe API local, SQLite, catalogo de ecossistema, missao persistida, adaptador Ollama com fallback offline e executor local que cria artefatos reais em `data/artifacts/`. Autenticacao OAuth, conectores externos, memoria vetorial e execucao avancada de ferramentas ainda sao proximos modulos.
