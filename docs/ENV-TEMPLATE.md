# Template de variáveis de ambiente (execução local)

Copie este conteúdo para um arquivo `.env` na raiz do projeto e preencha os valores.

## Banco de dados (obrigatório)

```
DATABASE_URL="mysql://USUARIO:SENHA@localhost:3306/nexus"
```

MySQL 8+ local, TiDB Serverless (grátis em [tidbcloud.com](https://tidbcloud.com)) ou Docker (`docker run --name nexus-db -e MYSQL_ROOT_PASSWORD=... -p 3306:3306 -d mysql:8`).

## Sessão / OAuth

```
JWT_SECRET="senha-aleatoria-longa"
OAUTH_SERVER_URL="https://api.manus.im"
VITE_APP_ID="seu-app-id"
VITE_OAUTH_PORTAL_URL="https://api.manus.im"
```

Em execução local sem login Manus, a autenticação OAuth pode ser adaptada em `server/_core/oauth.ts` (ver `docs/LOCAL-SETUP.md`).

## Motor de IA (Fase 14 — padrão global)

```
NEXUS_LLM_PROVIDER="ollama"
NEXUS_LLM_MODEL="llama3.1"
```

Provedores aceitos: `forge | openai | anthropic | google | groq | openrouter | ollama | qwen | custom`.

## Chaves de provedores externos (opcionais — ou defina por usuário na UI Config)

```
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
GOOGLE_API_KEY="AIza..."
GROQ_API_KEY="gsk_..."
OPENROUTER_API_KEY="sk-or-..."
QWEN_API_KEY="sk-ws-..."
OLLAMA_BASE_URL="http://localhost:11434/api"
```

## Fase 15 — Embeddings (Super Memória semântica / RAG)

A `QWEN_API_KEY` ativa também os embeddings (`text-embedding-v3`, 1024 dimensões, dashscope-intl). Sem ela, a busca semântica da Super Memória e o RAG do agente caem automaticamente para o fallback textual (BM25-lite) — nada quebra, só perde precisão.

```env
QWEN_API_KEY="sk-ws-..."               # também ativa embeddings se presente
QWEN_EMBEDDING_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
```

## Fase 15 — Ponte Neural SIAOL (multi-agentes)

Canal de comunicação entre o agente NEXUS (Manus-01) e outras IAs da rede SIAOL-PRO. Se o token ficar vazio, a ferramenta `symbiosis_post` fica desativada e o agente segue as missões normalmente.

```env
SIAOL_BRIDGE_URL="https://seudominio.ngrok-free.dev/message"
SIAOL_BRIDGE_TOKEN="bearer-token-da-sua-ponte"
```

## E-mail (opcional — notificações)

```
RESEND_API_KEY="re_..."
```

> **Segurança**: nunca commite o `.env` no Git. O `.gitignore` já o exclui. Se alguma chave vazou para o histórico, revise-a imediatamente.
