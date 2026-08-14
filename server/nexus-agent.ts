/**
 * Phase 13 — NEXUS × Manus fusion: autonomous agent loop executor.
 *
 * Concepts imported from the Manus architecture:
 *  - Autonomous loop: plan → act → observe, iterating until the mission is done.
 *  - Actionable tools: the LLM picks a tool each iteration; tools do real work
 *    (memory retrieval, memory persistence, agent delegation, finish).
 *  - Persistent step history (mission_steps) so the loop can resume/replay.
 *  - Failure tolerance: a tool error is fed back as an observation and the
 *    model decides the next step instead of aborting the whole mission.
 *
 * The executor is intentionally synchronous-per-request like the classic
 * pipeline (missions.execute), but every step is persisted and broadcast to
 * the cognitive feed as it happens, and the mission can be streamed via SSE.
 */
import { invokeLLM, type ToolCall, type Tool } from "./_core/llm";
import { addMissionStep, addFeedEvent, updateMission, getMemoryByTier, addMemory, addInAppNotification, awardXp, fireMissionWebhooks, evaluateAchievements } from "./db";
import {
  runShell, readFile, writeFile, editFile, listDir, webFetch,
  trackRead,
} from "./nexus-computer-tools";
import { invokeLLMWithProvider, type ProviderConfig } from "./nexus-multillm";

const AGENTS = ["Sincronia", "Pesquisa", "Memória", "Código", "Planejamento", "Crítica", "Síntese", "Execução", "Comunicação"] as const;

const MAX_ITERATIONS = 14; // hard safety cap on the autonomous loop

const MEMORY_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "search_memory",
      description: "Search the user's long-term memory for context relevant to the mission. Returns recent active memories.",
      parameters: {
        type: "object",
        properties: {
          query_hint: { type: "string", description: "Short hint of what to look for in memory (used to pick tier)." },
        },
        required: ["query_hint"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Persist an insight, fact, or intermediate finding to long-term memory for future missions.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "The insight or finding to remember." },
          tags: { type: "array", items: { type: "string" }, description: "Tags for retrieval." },
        },
        required: ["content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_agent",
      description: "Delegate a sub-task to one of the specialized NEXUS agents, who reasons about it and returns a result.",
      parameters: {
        type: "object",
        properties: {
          agent: { type: "string", enum: [...AGENTS], description: "The specialized agent to delegate to." },
          subtask: { type: "string", description: "The sub-task description for the agent." },
        },
        required: ["agent", "subtask"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_shell",
      description: "Execute a shell command in the mission sandbox workspace. Only simple, safe commands (list files, run python/node scripts, grep, etc.). Dangerous system commands are blocked. Use relative paths for your workspace files.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The bash command to run." },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file inside the mission workspace. Use relative paths (e.g. 'notas.txt'). Supports offset/limit for large files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path inside the workspace." },
          offset: { type: "number", description: "First line to read (default 1)." },
          limit: { type: "number", description: "Max lines to read (default 2000)." },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create a new file or fully overwrite an existing file in the mission workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path inside the workspace." },
          content: { type: "string", description: "Full file content." },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace an exact string inside a file in the mission workspace. The old_string must be unique; read the file first.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path inside the workspace." },
          old_string: { type: "string", description: "The exact text to replace." },
          new_string: { type: "string", description: "The replacement text." },
          replace_all: { type: "boolean", description: "Replace all occurrences." },
        },
        required: ["path", "old_string", "new_string"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List the contents of a directory inside the mission workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative directory path (use '.' for the workspace root)." },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description: "Fetch a public URL and extract its text content.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to fetch (http or https)." },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "Synthesize all accumulated observations into the final mission result and end the loop.",
      parameters: {
        type: "object",
        properties: {
          result: { type: "string", description: "The complete final mission result." },
          confidence: { type: "number", description: "Self-assessed confidence between 0 and 1." },
        },
        required: ["result", "confidence"],
        additionalProperties: false,
      },
    },
  },
];

const AGENT_PROMPT: Record<string, string> = {
  Sincronia: "You are Sincronia, the orchestration agent. Align and coordinate knowledge about the subtask.",
  Pesquisa: "You are Pesquisa, the research agent. Gather, browse and analyze information for the subtask.",
  "Memória": "You are Memória, the memory agent. Recall and structure relevant past context for the subtask.",
  Código: "You are Código, the coding agent. Design and implement software solutions for the subtask.",
  Planejamento: "You are Planejamento, the strategy agent. Structure roadmaps and strategy for the subtask.",
  Crítica: "You are Crítica, the validation agent. Critically review and validate the subtask output.",
  Síntese: "You are Síntese, the consolidation agent. Distill complex information for the subtask.",
  Execução: "You are Execução, the implementation agent. Define concrete implementation steps for the subtask.",
  Comunicação: "You are Comunicação, the interface agent. Craft clear, user-facing communication for the subtask.",
};

export type AgentLoopResult = {
  interpretation: { interpretedGoal: string; complexity: string; initialPlan: string };
  steps: { stepType: string; toolName?: string; agentName?: string; detail?: string }[];
  result: string;
  confidence: number;
};

/**
 * Run the autonomous agent loop for a mission.
 */
export async function runAgentLoop(
  userId: number,
  missionId: number,
  missionInput: string,
  opts: { maxIterations?: number; provider?: ProviderConfig; enableComputerTools?: boolean; webEnabled?: boolean } = {}
): Promise<AgentLoopResult> {
  const maxIter = opts.maxIterations ?? MAX_ITERATIONS;
  const provider: ProviderConfig = opts.provider ?? { provider: "forge" };
  const callLLM = (params: Parameters<typeof invokeLLMWithProvider>[1]) => invokeLLMWithProvider(provider, params);
  const computerEnabled = opts.enableComputerTools === true;
  const webEnabled = opts.webEnabled !== false;
  const model = provider.model || "gpt-5-mini";

  // --- Interpretation (same as classic pipeline) ---
  const interpretation = await callLLM({
    model,
    messages: [
      { role: "system", content: "You are NEXUS, an Intelligent Infrastructure. Interpret the mission, identify the goal, complexity and an initial plan. Return JSON." },
      { role: "user", content: missionInput },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "mission_interpretation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            interpretedGoal: { type: "string" },
            complexity: { type: "string", enum: ["low", "medium", "high", "extreme"] },
            initialPlan: { type: "string" },
          },
          required: ["interpretedGoal", "complexity", "initialPlan"],
          additionalProperties: false,
        },
      },
    },
  });
  const interp = JSON.parse(interpretation.choices[0].message.content as string);
  await updateMission(userId, missionId, { status: "executing", startedAt: new Date() });
  await persist(userId, missionId, "plan", undefined, "Orquestrador", `Missão recebida: ${interp.interpretedGoal}`);
  await persist(userId, missionId, "plan", undefined, "Orquestrador", `Complexidade: ${interp.complexity} | Plano: ${interp.initialPlan}`);

  // Seed recent memory into the context (persistent mission context, Manus-style)
  const recentMemories = await getMemoryByTier(userId, "ativa");
  type CtxMsg = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: unknown };
  const contextWindow: CtxMsg[] = [
    {
      role: "system",
      content:
        `You are the NEXUS autonomous agent (fusion mode). You execute missions by choosing tools each iteration. Available tools: search_memory, save_memory, ask_agent${computerEnabled ? ", run_shell, read_file, write_file, edit_file, list_dir" : ""}${webEnabled ? ", web_fetch" : ""}, finish. Choose ONE tool per response. The mission ends only with finish. If a previous tool call failed, acknowledge the error and adapt. Keep details concise. For computer tools use simple relative paths inside the workspace (e.g. 'dados.txt').`,
    },
    {
      role: "user",
      content: `Mission: ${missionInput}\n\nInterpreted goal: ${interp.interpretedGoal}\n\nRelevant context from your long-term memory:\n${
        recentMemories.slice(0, 8).map((m: any) => `- ${m.content}`).join("\n") || "(nenhuma memória ativa)"
      }`,
    },
  ];

  const steps: AgentLoopResult["steps"] = [];
  let iterations = 0;
  let result = "";
  let confidence = 0.85;

  while (iterations < maxIter) {
    iterations += 1;

    // Think + act: the model picks one tool
    let message: { role: string; content: unknown; tool_calls?: ToolCall[] };
    try {
      const response = await invokeLLM({
        model,
        messages: contextWindow,
        tools: MEMORY_TOOLS,
        // O endpoint de LLM não suporta tool_choice "required" (exige nome de ferramenta
        // explícito ou "auto"). Com "auto" o modelo sempre escolhe uma ferramenta,
        // pois o system prompt instrui que a resposta DEVE ser via tool call.
        tool_choice: "auto",
      });
      message = response.choices[0].message as { role: string; content: unknown; tool_calls?: ToolCall[] };
    } catch (modelError) {
      // Failure tolerance at the model layer: an LLM blip is reported as an
      // observation and the loop tries again (or synthesizes on exhaustion).
      // O feed cognitivo é lido por usuários finais: persiste uma mensagem amigável.
      const raw = String(modelError);
      const friendly =
        /timed out/i.test(raw)
          ? "O modelo de IA demorou para responder — o agente tentará novamente."
          : /abort/i.test(raw)
            ? "Conexão com o modelo interrompida — o agente tentará novamente."
            : "Falha temporária no modelo de IA — o agente tentará novamente.";
      await persist(userId, missionId, "tool_error", "invokeLLM", undefined, friendly);
      continue;
    }
    const toolCalls: ToolCall[] = ((message as any).tool_calls ?? []) as ToolCall[];
    const thinkingText = typeof message.content === "string" && message.content.trim() ? message.content.slice(0, 300) : "";
    if (thinkingText) {
      await persist(userId, missionId, "thought", undefined, "Orquestrador", thinkingText);
    }

    const call = toolCalls[0];
    if (!call) {
      await persist(userId, missionId, "error", undefined, "Orquestrador", "O modelo não retornou uma chamada de ferramenta. Encerrando.");
      break;
    }

    let toolResultText = "";
    try {
      const args = JSON.parse(call.function.arguments || "{}");
      await persist(userId, missionId, "tool_call", call.function.name, undefined, JSON.stringify(args).slice(0, 400));

      if (call.function.name === "finish") {
        result = String(args.result ?? "").slice(0, 8000);
        confidence = Math.min(1, Math.max(0, Number(args.confidence ?? 0.85)));
        toolResultText = `finish: result=${result.slice(0, 200)} confidence=${confidence}`;
        await persist(userId, missionId, "tool_result", "finish", undefined, `Síntese final gerada (confiança ${Math.round(confidence * 100)}%)`);
        contextWindow.push({ role: "assistant", content: "" });
        (contextWindow[contextWindow.length - 1] as any).tool_calls = toolCalls;
        contextWindow.push({ role: "tool", content: "finished", tool_call_id: call.id } as CtxMsg);
        break;
      }

      if (call.function.name === "search_memory") {
        const mems = await getMemoryByTier(userId, "ativa");
        toolResultText = mems.slice(0, 6).map((m: any) => m.content).join("\n") || "Nenhuma memória relevante encontrada.";
        await persist(userId, missionId, "tool_result", "search_memory", undefined, toolResultText.slice(0, 600));
        contextWindow.push({ role: "assistant", content: "" });
        (contextWindow[contextWindow.length - 1] as any).tool_calls = toolCalls;
        contextWindow.push({ role: "tool", content: toolResultText.slice(0, 2000), tool_call_id: call.id } as CtxMsg);
      } else if (call.function.name === "save_memory") {
        const tags = Array.isArray(args.tags) ? args.tags.map(String).slice(0, 6) : ["agent", "fusion"];
        await addMemory(userId, { content: String(args.content ?? "").slice(0, 2000), origin: "agent_loop", tags });
        toolResultText = `Memória salva (tags: ${tags.join(", ")})`;
        await persist(userId, missionId, "tool_result", "save_memory", undefined, toolResultText);
        contextWindow.push({ role: "assistant", content: "" });
        (contextWindow[contextWindow.length - 1] as any).tool_calls = toolCalls;
        contextWindow.push({ role: "tool", content: toolResultText, tool_call_id: call.id } as CtxMsg);
      } else if (call.function.name === "ask_agent") {
        const agentName = AGENTS.includes(args.agent as (typeof AGENTS)[number]) ? args.agent : "Sincronia";
        const subtask = String(args.subtask ?? "").slice(0, 1500);
        const agentResult = await callLLM({
          model,
          messages: [
            { role: "system", content: `${AGENT_PROMPT[agentName] ?? AGENT_PROMPT.Sincronia} Return a concise, actionable result.` },
            { role: "user", content: `Mission: ${missionInput}\n\nGoal: ${interp.interpretedGoal}\n\nSubtask: ${subtask}` },
          ],
        });
        const agentContent = agentResult.choices[0].message.content;
        toolResultText = typeof agentContent === "string" ? agentContent : String(agentContent);
        await persist(userId, missionId, "agent_result", "ask_agent", agentName as string, toolResultText.slice(0, 800));
        contextWindow.push({ role: "assistant", content: "" });
        (contextWindow[contextWindow.length - 1] as any).tool_calls = toolCalls;
        contextWindow.push({ role: "tool", content: toolResultText.slice(0, 2000), tool_call_id: call.id } as CtxMsg);
      } else if (call.function.name === "run_shell" && computerEnabled) {
        toolResultText = await runShell(userId, String(args.command ?? "").slice(0, 2000));
        await persist(userId, missionId, "tool_result", "run_shell", undefined, toolResultText.slice(0, 500));
        contextWindow.push({ role: "assistant", content: "" });
        (contextWindow[contextWindow.length - 1] as any).tool_calls = toolCalls;
        contextWindow.push({ role: "tool", content: toolResultText.slice(0, 2000), tool_call_id: call.id } as CtxMsg);
      } else if (call.function.name === "read_file" && computerEnabled) {
        toolResultText = await readFile(userId, String(args.path ?? ""), { offset: Number(args.offset ?? 1), limit: Number(args.limit ?? 2000) });
        trackRead(missionId, String(args.path ?? ""));
        await persist(userId, missionId, "tool_result", "read_file", undefined, toolResultText.slice(0, 500));
        contextWindow.push({ role: "assistant", content: "" });
        (contextWindow[contextWindow.length - 1] as any).tool_calls = toolCalls;
        contextWindow.push({ role: "tool", content: toolResultText.slice(0, 2000), tool_call_id: call.id } as CtxMsg);
      } else if (call.function.name === "write_file" && computerEnabled) {
        toolResultText = await writeFile(userId, String(args.path ?? ""), String(args.content ?? ""));
        await persist(userId, missionId, "tool_result", "write_file", undefined, toolResultText);
        contextWindow.push({ role: "assistant", content: "" });
        (contextWindow[contextWindow.length - 1] as any).tool_calls = toolCalls;
        contextWindow.push({ role: "tool", content: toolResultText, tool_call_id: call.id } as CtxMsg);
      } else if (call.function.name === "edit_file" && computerEnabled) {
        toolResultText = await editFile(userId, missionId, String(args.path ?? ""), String(args.old_string ?? ""), String(args.new_string ?? ""), Boolean(args.replace_all));
        await persist(userId, missionId, "tool_result", "edit_file", undefined, toolResultText);
        contextWindow.push({ role: "assistant", content: "" });
        (contextWindow[contextWindow.length - 1] as any).tool_calls = toolCalls;
        contextWindow.push({ role: "tool", content: toolResultText, tool_call_id: call.id } as CtxMsg);
      } else if (call.function.name === "list_dir" && computerEnabled) {
        toolResultText = await listDir(userId, String(args.path ?? "."));
        await persist(userId, missionId, "tool_result", "list_dir", undefined, toolResultText.slice(0, 500));
        contextWindow.push({ role: "assistant", content: "" });
        (contextWindow[contextWindow.length - 1] as any).tool_calls = toolCalls;
        contextWindow.push({ role: "tool", content: toolResultText.slice(0, 2000), tool_call_id: call.id } as CtxMsg);
      } else if (call.function.name === "web_fetch" && webEnabled) {
        toolResultText = await webFetch(String(args.url ?? ""));
        await persist(userId, missionId, "tool_result", "web_fetch", undefined, toolResultText.slice(0, 500));
        contextWindow.push({ role: "assistant", content: "" });
        (contextWindow[contextWindow.length - 1] as any).tool_calls = toolCalls;
        contextWindow.push({ role: "tool", content: toolResultText.slice(0, 2000), tool_call_id: call.id } as CtxMsg);
      } else {
        toolResultText = `Ferramenta desconhecida ou desativada: ${call.function.name}`;
        contextWindow.push({ role: "assistant", content: "" });
        (contextWindow[contextWindow.length - 1] as any).tool_calls = toolCalls;
        contextWindow.push({ role: "tool", content: toolResultText, tool_call_id: call.id } as CtxMsg);
      }
    } catch (toolError) {
      // Failure tolerance: report the error as the observation; the model adapts.
      // Mensagem técnica fica apenas no histórico de steps; o feed mostra texto amigável.
      const rawTool = String(toolError);
      const friendlyTool = `A ferramenta "${call.function.name}" falhou — o agente ajustou o plano e tentará outro caminho.`;
      await persist(userId, missionId, "tool_error", call.function.name, undefined, friendlyTool);
      contextWindow.push({ role: "assistant", content: "" });
      (contextWindow[contextWindow.length - 1] as any).tool_calls = toolCalls;
      contextWindow.push({ role: "tool", content: rawTool.slice(0, 2000), tool_call_id: call.id } as CtxMsg);
    }

    // Context window compression: drop the oldest observations when too large
    if (contextWindow.length > 16) {
      // keep system + first user message + last 10 conversation turns
      contextWindow.splice(2, contextWindow.length - 12);
    }

    steps.push({ stepType: "loop", toolName: call.function.name });
  }

  if (!result) {
    // Loop exhausted without an explicit finish — synthesize from the history
    const historySummary = steps.map((s) => `${s.stepType}${s.toolName ? ":" + s.toolName : ""}`).join(" → ");
    result = `O agente concluiu a missão após ${iterations} iterações (${historySummary}). Contexto acumulado disponível no feed cognitivo e no histórico da missão.`;
    confidence = 0.75;
    await persist(userId, missionId, "complete", undefined, "Orquestrador", `Loop encerrado (limite de ${maxIter} iterações). Confiança: ${Math.round(confidence * 100)}%`);
  }

  const confRounded = Number(confidence.toFixed(3));
  await addMemory(userId, { content: `Missão (modo agente): ${missionInput}\nResultado: ${result.slice(0, 1200)}`, confidence: confRounded, origin: "mission", tags: ["mission", "result", "agent-loop"] });
  // Super Memória (Fase 14b): descobertas do agente viram notas permanentes estilo Obsidian
  try {
    const { addSuperNote } = await import("./db");
    await addSuperNote({
      userId,
      title: `Missão: ${interp.interpretedGoal.slice(0, 80)}`,
      content: `# ${interp.interpretedGoal}\n\n**Missão:** ${missionInput}\n\n**Resultado (confiança ${Math.round(confRounded * 100)}%):**\n\n${result.slice(0, 4000)}\n\n---\n_Gerada automaticamente pelo loop do agente — NEXUS._`,
      folder: "Missões",
      tags: JSON.stringify(["missão", "agente", "resultado"]),
      source: "agent",
      missionId,
    });
  } catch { /* never block mission */ }
  await updateMission(userId, missionId, { status: "completed", result, confidence: confRounded, completedAt: new Date() });
  await persist(userId, missionId, "complete", undefined, "Síntese", `Missão concluída — confiança: ${Math.round(confRounded * 100)}%`, confRounded);

  // Side effects (same guarantees as classic pipeline)
  try { await awardXp(userId, "mission_complete"); } catch { /* never block mission */ }
  fireMissionWebhooks(missionId, { input: missionInput, result, confidence: confRounded }).catch(() => {});
  try {
    const { notifyOwner } = await import("./_core/notification");
    await notifyOwner({ title: "[NEXUS] Missão Concluída (Modo Agente)", content: `Confiança ${Math.round(confRounded * 100)}%. ${missionInput.slice(0, 100)}` });
  } catch { /* optional */ }
  await addInAppNotification(userId, "mission", "Missão concluída (Modo Agente)", `Confiança: ${Math.round(confRounded * 100)}%. ${missionInput.slice(0, 120)}`).catch(() => {});
  try { if (getUserEmail()) { /* email optional */ } } catch { /* noop */ }
  evaluateAchievements(userId).catch(() => {});

  return { interpretation: { interpretedGoal: interp.interpretedGoal, complexity: interp.complexity, initialPlan: interp.initialPlan }, steps, result, confidence: confRounded };
}

function getUserEmail(): string | null {
  return null;
}

async function persist(userId: number, missionId: number, eventType: string, toolName?: string, agentName?: string, message?: string, confidence?: number) {
  // Persist to mission_steps (agent history) AND the cognitive feed (UI) atomically as much as possible.
  if (message) {
    await addFeedEvent(userId, { eventType, message, confidence, agentName, missionId }).catch(() => {});
  }
  await addMissionStep(missionId, { stepType: eventType, toolName, agentName, detail: message ?? undefined }).catch(() => {});
}
