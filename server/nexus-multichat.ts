/**
 * Fase 18 — Chat multiagente ao vivo.
 *
 * Conversa contínua com agentes especializados (Sincronia, Pesquisa, Memória,
 * Código, Planejamento, Crítica, Síntese, Execução, Comunicação) com acesso
 * à Super Memória via RAG (embeddings vetoriais, fallback textual).
 *
 * Fluxo por mensagem:
 *  1. Embedding da mensagem do usuário (QwenCloud text-embedding-v3)
 *  2. Busca semântica nas notas da Super Memória (top-N por cosseno)
 *  3. Contexto injetado no system prompt do agente escolhido
 *  4. Invocação do LLM com o modelo/provedor escolhido pelo usuário
 *  5. Registro na memória e feed cognitivo
 */
import { type InvokeParams } from "./_core/llm";
import { invokeLLMWithProvider, type ProviderConfig } from "./nexus-multillm";
import { generateEmbedding, isEmbeddingAvailable } from "./nexus-embeddings";
import { semanticSearchSuperNotes, searchSuperNotes, getAgents, addMemory, addFeedEvent, getLlmSettings } from "./db";

export interface MultiAgentChatOptions {
  provider: ProviderConfig;
  userId: number;
  agentName?: string; // nome do agente especializado; vazio = NEXUS geral
  includeRag?: boolean; // padrão true
  history?: { role: "user" | "assistant"; content: string }[]; // últimos turns da sessão
}

const AGENT_PERSONAS: Record<string, { area: string; style: string }> = {
  "Sincronia": { area: "orquestração e sincronização de tarefas", style: "organizado e coordenador" },
  "Pesquisa": { area: "pesquisa, fontes e verificação de fatos", style: "analítico e criterioso" },
  "Memória": { area: "organização, recuperação e priorização de conhecimento", style: "detalhista e arquivista" },
  "Código": { area: "desenvolvimento, revisão e depuração de código", style: "preciso e prático, usando trechos de código" },
  "Planejamento": { area: "planejamento, decomposição de problemas e estimativas", style: "estruturado, com planos em etapas" },
  "Crítica": { area: "revisão crítica, identificação de riscos e falhas", style: "direto e questionador" },
  "Síntese": { area: "síntese, sumarização e organização de ideias", style: "conciso e estruturado" },
  "Execução": { area: "execução prática, automação e colocação em prática", style: "acionável, focado em passos concretos" },
  "Comunicação": { area: "comunicação, redação e apresentações", style: "claro e persuasivo" },
};

export async function buildAgentSystemPrompt(agentName?: string): Promise<string> {
  const base =
    "Você é o NEXUS, uma plataforma cognitiva universal multiagente. Responda sempre em português brasileiro, " +
    "de forma útil, concisa e com tom técnico mas acessível. Quando aplicável, use markdown leve (títulos, listas, código).";
  if (!agentName || agentName === "all" || !AGENT_PERSONAS[agentName]) return base;
  const persona = AGENT_PERSONAS[agentName];
  return (
    `Você é o agente NEXUS "${agentName}" — especialista em ${persona.area}. ` +
    `Adote um estilo ${persona.style}. Responda em português brasileiro, focando na sua área de especialidade. ` +
    `Use markdown leve quando ajudar.`
  );
}

export async function buildRagContext(userId: number, userMessage: string, maxNotes = 3): Promise<string> {
  if (!isEmbeddingAvailable()) {
    // fallback textual
    const hits = (await searchSuperNotes(userId, userMessage)).slice(0, maxNotes);
    if (hits.length === 0) return "";
    return (
      "Notas relevantes da Super Memória do usuário (busca textual):\n" +
      hits.map(h => `- ${h.title || "(sem título)"}: ${h.content.slice(0, 300)}`).join("\n")
    );
  }
  const emb = await generateEmbedding(userMessage);
  if (!emb || !("vector" in emb)) return "";
  const ranked = await semanticSearchSuperNotes(userId, emb.vector as number[], { limit: maxNotes });
  const matches = ranked.filter(r => r.score > 0.2);
  if (matches.length === 0) return "";
  return (
    "Notas relevantes da Super Memória do usuário (busca semântica, scores):\n" +
    matches.map(r => `- ${r.note.title || "(sem título)"} [${r.score.toFixed(3)}]: ${r.note.content.slice(0, 300)}`).join("\n")
  );
}

/** Resolve o provider config a partir das preferências do usuário. */
export async function resolveUserProvider(userId: number): Promise<ProviderConfig> {
  const llm = await getLlmSettings(userId);
  if (llm?.apiKey) {
    return { provider: llm.provider as any, apiKey: llm.apiKey ?? undefined, baseUrl: llm.baseUrl ?? undefined, model: llm.model ?? undefined };
  }
  return { provider: (llm?.provider ?? "forge") as any, model: llm?.model ?? undefined };
}

export interface MultiAgentChatResult {
  response: string;
  ragNotes: number;
  agentName: string;
}

/** Uma rodada completa do chat multiagente (síncrona, por tRPC mutation). */
export async function multiAgentChat(
  userId: number,
  input: { message: string; agent?: string; history?: { role: "user" | "assistant"; content: string }[] },
): Promise<MultiAgentChatResult> {
  const agentName = input.agent && input.agent !== "all" ? input.agent : "";
  const [systemPrompt, ragContext] = await Promise.all([
    buildAgentSystemPrompt(agentName),
    input.message.trim() ? buildRagContext(userId, input.message.trim()) : Promise.resolve(""),
  ]);

  const history = (input.history ?? []).slice(-10).map(h => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));

  const messages: InvokeParams["messages"] = [
    { role: "system" as const, content: ragContext ? `${systemPrompt}\n\n---\n${ragContext}` : systemPrompt },
    ...history,
    { role: "user" as const, content: input.message.trim() },
  ];

  const provider = await resolveUserProvider(userId);
  const result = await invokeLLMWithProvider(provider, { messages });

  const responseText =
    typeof result.choices?.[0]?.message?.content === "string"
      ? (result.choices[0].message.content as string)
      : String(result.choices?.[0]?.message?.content ?? "");

  // Registro (fire-and-forget com tratamento individual de erros — o registro
  // não deve bloquear nem derrubar a resposta, mas cada inserção executa até o fim)
  registerChat(userId, agentName, input.message.trim(), responseText).catch(() => {});

  return { response: responseText, ragNotes: ragContext ? ragContext.split("\n").filter(l => l.startsWith("-")).length : 0, agentName: agentName || "NEXUS" };
}

async function registerChat(
  userId: number,
  agentName: string,
  userMessage: string,
  responseText: string,
): Promise<void> {
  const label = agentName ? ` ${agentName}` : "";
  await addMemory(userId, { content: `[Chat Agente${label}] ${userMessage.slice(0, 300)}`, origin: "chat", tags: ["chat", agentName || "nexus"] }).catch(() => {});
  await addMemory(userId, { content: `[Chat Agente${label}] Resposta: ${responseText.slice(0, 200)}`, origin: "chat", tags: ["chat", "response"] }).catch(() => {});
  await addFeedEvent(userId, { eventType: "mission", message: `[Chat] Mensagem para ${agentName || "NEXUS"}: ${userMessage.slice(0, 80)}` }).catch(() => {});
}

export { AGENT_PERSONAS };
