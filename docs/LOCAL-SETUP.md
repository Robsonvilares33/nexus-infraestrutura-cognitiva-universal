# NEXUS — Guia de Instalação Local

Este documento explica como baixar e rodar o NEXUS (Infraestrutura Cognitiva Universal) no seu próprio computador. O projeto é totalmente open source: qualquer pessoa pode baixar o código, estudar e executar localmente.

## 1. Requisitos do sistema

O NEXUS foi construído com React 19, Tailwind 4, Express 4, tRPC 11 e Drizzle ORM (MySQL). Para rodar tudo localmente, você precisa de:

| Componente | Requisito | Observação |
|---|---|---|
| Node.js | 22+ | Download em [nodejs.org](https://nodejs.org). Verifique com `node -v`. |
| pnpm | qualquer versão 9+ | Instalado com `corepack enable` ou `npm i -g pnpm`. |
| Banco de dados | MySQL 8+ ou TiDB | Opções gratuitas na seção 3. |
| Espaço em disco | ~2 GB livres | Código + dependências + banco local. |
| Memória RAM | 8 GB+ (12 GB confortável) | Roda bem em PCs modestos — sem GPU. |

Máquinas com processador i3 e 8–12 GB de RAM (como um notebook com i3 12 GB e 80 GB de disco) executam o NEXUS sem problema, pois o peso da IA fica nos servidores do provedor de modelo (OpenAI, Groq, QwenCloud etc.), não no seu computador.

## 2. Baixando e iniciando

```bash
# Baixe o código
git clone https://github.com/Robsonvilares33/nexus-infraestrutura-cognitiva-universal.git
cd nexus-infraestrutura-cognitiva-universal

# Instale as dependências
pnpm install

# Configure as variáveis de ambiente (copie o template)
cp docs/ENV-TEMPLATE.md .env   # edite o .env com seus valores

# Inicie o banco local (ver seção 3) e crie as tabelas
pnpm drizzle-kit push                # aplica o schema do Drizzle ao banco

# Inicie o servidor
pnpm dev                             # abre em http://localhost:3000
```

O ambiente padrão do template (Manus OAuth, variáveis `BUILT_IN_FORGE_*`) funciona quando o projeto está hospedado na Manus. Em execução local pura, consulte a seção 4 para as alternativas sem login Manus.

## 3. Banco de dados (MySQL ou TiDB)

O NEXUS usa MySQL/TiDB (Drizzle ORM). Três caminhos possíveis:

1. **MySQL Community local** — instale o MySQL 8 e crie o banco `nexus`:
   ```sql
   CREATE DATABASE nexus CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
   Aponte `DATABASE_URL="mysql://usuario:senha@localhost:3306/nexus"`.

2. **TiDB Serverless (grátis na nuvem)** — crie um cluster em [tidbcloud.com](https://tidbcloud.com) (plano gratuito generoso, compatível com MySQL). Use a connection string com SSL ativado.

3. **Docker (rápido)** — um MySQL em container:
   ```bash
   docker run --name nexus-db -e MYSQL_ROOT_PASSWORD=senha123 -p 3306:3306 -d mysql:8
   ```

## 4. Autenticação em execução local

O template usa **Manus OAuth**, que requer as variáveis injetadas pelo ambiente de hospedagem Manus. Para rodar localmente sem essa dependência, há duas alternativas:

- **Desativar a exigência de OAuth**: crie uma conta de desenvolvimento editando o schema de autenticação ou usando `JWT_SECRET` próprio com sessão local (documentar a alteração em `server/_core/oauth.ts`). Para equipes internas ou uso pessoal, isso é suficiente.
- **Manter o OAuth Manus**: defina `VITE_APP_ID`, `OAUTH_SERVER_URL`, `JWT_SECRET` e `VITE_OAUTH_PORTAL_URL` com valores próprios de uma aplicação OAuth compatível.

## 5. Motor de IA — escolha qualquer modelo (Fase 14)

O NEXUS foi projetado para ser **agente de modelo aberto**: você escolhe o provedor por usuário no painel **Config → Motor de IA**, ou define o padrão global no `.env`. Provedores gratuitos e baratos:

| Provedor | Custo | Chave | Modelos típicos |
|---|---|---|---|
| **Ollama (local)** | grátis, offline | nenhuma | llama3.1, qwen2.5, mistral |
| **Groq** | tier grátis | `gsk_...` | llama-3.3-70b, mixtral-8x7b |
| **Google Gemini** | tier grátis | `AIza...` | gemini-2.5-flash |
| **OpenRouter** | modelos grátis | `sk-or-...` | centenas |
| **QwenCloud (Alibaba)** | pay-as-you-go (barato) | `sk-ws-...` | qwen3.8-max, qwen-coder-plus |
| **OpenAI / Anthropic** | pago | `sk-...` / `sk-ant-...` | gpt-4.1+, claude-sonnet |

No `.env` local, por exemplo:

```
NEXUS_LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/api
```

Ou, via painel da UI (Config → Motor de IA), escolha o provedor e cole a chave — cada usuário mantém sua própria configuração.

### Testando sua chave

Com o servidor rodando, crie uma missão em **Minha IA** com o **Modo Agente** ativado. O console ao vivo mostrará cada passo do loop think-act-observe do agente.

## 6. Ferramentas de computador (Fase 14)

O agente pode usar `run_shell`, `read_file`, `write_file`, `edit_file`, `list_dir` e `web_fetch` — o mesmo conjunto conceitual do Claude Code. Por segurança:

- Os comandos rodam em um **workspace isolado** (`/tmp/nexus-workspace/<userId>/`), nunca em diretórios sensíveis.
- Comandos perigosos (`rm -rf /`, `curl | sh`, sudo, chown etc.) são **bloqueados por padrão**.
- **Timeout** por comando (120s) e limite de saída (16 KB).
- `shellEnabled` e `webEnabled` são controláveis por usuário no painel Config — desligados por padrão (exceto web).

Em execução local, os comandos rodam no SEU computador: ative apenas com modelos de sua confiança.

## 7. Super Memória (estilo Obsidian)

A página **Super Memória** é um cofre de notas pessoal infinito, com Markdown, tags, links entre notas (`[[nota]]`) e busca. O agente do Modo Agente grava automaticamente suas descobertas como notas ao final de cada missão e consulta o cofre antes de responder. Os dados vivem no seu banco MySQL — sua memória nunca desaparece.

## 8. Busca semântica e RAG (Fase 15)

Com a `QWEN_API_KEY` configurada, o NEXUS gera **embeddings** das suas notas da Super Memória (`text-embedding-v3`, 1024 dimensões) e a busca ganha um modo **semântico**: o toggle "Semântica" na Super Memória retorna as notas por relevância de significado, não apenas por palavras exatas — cada resultado mostra a pontuação de relevância. Cada nota criada ou editada é indexada automaticamente (pode reindexar manualmente pela API).

O agente do Modo Agente usa esse cofre por **RAG** (Recuperação Aumentada por Geração): antes de começar uma missão, ele consulta as notas mais relevantes da sua Super Memória e injeta no contexto — e durante a missão pode chamar `memory_search` para aprofundar. Se a chave de embeddings não estiver disponível, tudo decai silenciosamente para o fallback textual (BM25-lite), mantendo o sistema funcional.

## 8a. Ponte Neural SIAOL (multi-agentes)

O plugin **Ponte Neural SIAOL** (marketplace, categoria device) permite que o agente NEXUS, identificado como **Manus-01**, dialogue com outras IAs da rede SIAOL-PRO (Antigravity, MiniMax e futuras) pelo canal `symbiosis`, via ferramenta `symbiosis_post` com prioridade configurável. O endpoint e o token são definidos nas variáveis `SIAOL_BRIDGE_URL` / `SIAOL_BRIDGE_TOKEN` — configure apenas se você mantiver uma ponte ativa; sem elas a ferramenta fica desativada e as missões seguem normalmente.

## 9. Testes

```bash
pnpm test        # suíte completa (unit + integração com banco real)
```

O teste `server/qwen-key.test.ts` valida chaves de provedor externo ao vivo; `server/nexus-agent-live.test.ts` executa o loop do agente com LLM real.

## 10. Publicando

Para uma versão pessoal no ar, use o botão **Publish** da interface Manus (hospedagem com domínio customizado) ou exponha o Express local com nginx/traefik. O repositório público é o mesmo em ambos os casos — a única diferença são os secrets do `.env`.
