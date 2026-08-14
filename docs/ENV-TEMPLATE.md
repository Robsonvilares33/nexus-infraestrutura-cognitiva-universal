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

## E-mail (opcional — notificações)

```
RESEND_API_KEY="re_..."
```

> **Segurança**: nunca commite o `.env` no Git. O `.gitignore` já o exclui. Se alguma chave vazou para o histórico, revise-a imediatamente.
