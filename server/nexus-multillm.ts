/**
 * Phase 14 — NEXUS multi-model LLM adapter.
 *
 * The user may pick ANY provider: the embedded Manus Forge (default, no key
 * needed), OpenAI, Anthropic, Google Gemini, Groq, OpenRouter, or a local
 * Ollama instance. Each adapter speaks its native API and returns the same
 * InvokeResult shape the agent loop already consumes.
 */
import { invokeLLM, type InvokeParams, type InvokeResult } from "./_core/llm";
import { ENV } from "./_core/env";

export type LlmProvider = "forge" | "openai" | "anthropic" | "google" | "groq" | "openrouter" | "ollama" | "qwen" | "custom";

export type ProviderConfig = {
  provider: LlmProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export const PROVIDER_MODELS: Record<string, string[]> = {
  forge: ["gpt-5-mini", "gpt-5-nano", "gemini-flash", "claude-haiku"],
  openai: ["gpt-5", "gpt-5-mini", "gpt-4.1-mini", "gpt-4.1", "o3-mini"],
  anthropic: ["claude-opus-4", "claude-sonnet-4", "claude-sonnet-3.7", "claude-haiku-3.5"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
  openrouter: ["openai/gpt-4.1-mini", "anthropic/claude-sonnet-4", "google/gemini-2.5-flash", "meta-llama/llama-3.3-70b-instruct"],
  ollama: ["llama3.1", "mistral", "qwen2.5", "phi4", "deepseek-r1:8b"],
  qwen: ["qwen3.8-max", "qwen3-max", "qwen-plus", "qwen-turbo", "qwen-coder-plus"],
  custom: ["custom-model"],
};

const TIMEOUT_MS = 30_000;

const fetchJson = async (url: string, init: Parameters<typeof fetch>[1]): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`LLM invoke failed: ${res.status} ${res.statusText} – ${text.slice(0, 400)}`);
    try { return JSON.parse(text); } catch { throw new Error(`LLM invoke failed: resposta inválida (não-JSON) status ${res.status}`); }
  } finally {
    clearTimeout(timer);
  }
};

/** OpenAI-compatible chat completion (forge, openai, groq, openrouter, ollama) */
async function invokeOpenAICompatible(cfg: ProviderConfig, params: InvokeParams): Promise<InvokeResult> {
  const apiKey = cfg.provider === "ollama" ? "" : (cfg.apiKey || ENV.forgeApiKey || "");
  if (!apiKey) throw new Error(`Chave de API não configurada para o provedor "${cfg.provider}"`);
  const base = cfg.baseUrl || defaultBaseUrl(cfg.provider);
  const url = `${base.replace(/\/$/, "")}/chat/completions`;
  const payload = buildOpenAIStylePayload(cfg, params);
  const body = await fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify(payload),
  });
  return body as InvokeResult;
}

function defaultBaseUrl(provider: LlmProvider): string {
  switch (provider) {
    case "forge": return `${ENV.forgeApiUrl || "https://forge.manus.im"}`;
    case "openai": return "https://api.openai.com/v1";
    case "anthropic": return "https://api.anthropic.com/v1";
    case "google": return "https://generativelanguage.googleapis.com/v1beta";
    case "groq": return "https://api.groq.com/openai/v1";
    case "openrouter": return "https://openrouter.ai/api/v1";
    case "ollama": return "http://localhost:11434/api";
    case "qwen": return "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
    default: return cfgFallback();
  }
}
function cfgFallback(): string { return "https://api.openai.com/v1"; }

function buildOpenAIStylePayload(cfg: ProviderConfig, params: InvokeParams): Record<string, unknown> {
  const { messages, tools, toolChoice, tool_choice, maxTokens, max_tokens } = params;
  const payload: Record<string, unknown> = {
    model: cfg.model || "gpt-5-mini",
    messages: messages.map((m) => ({
      role: m.role === "function" ? "tool" : m.role,
      content: typeof m.content === "string" ? m.content : "", // agente loop só envia texto
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    })),
  };
  if (tools?.length) payload.tools = tools.map((t) => ({ type: "function", function: t.function }));
  const tc = toolChoice || tool_choice;
  if (tc) payload.tool_choice = tc;
  const mt = max_tokens ?? maxTokens;
  if (typeof mt === "number") payload.max_tokens = mt;
  // Structured output hint for providers that support it (Forge/OpenAI)
  const rf = params.responseFormat || params.response_format || params.outputSchema || params.output_schema;
  if (rf && cfg.provider !== "ollama") payload.response_format = rf;
  return payload;
}

/** Anthropic Messages API → InvokeResult shape */
async function invokeAnthropic(cfg: ProviderConfig, params: InvokeParams): Promise<InvokeResult> {
  const apiKey = cfg.apiKey;
  if (!apiKey) throw new Error(`Chave de API Anthropic não configurada (userLlmSettings.apiKey)`);
  const base = cfg.baseUrl || "https://api.anthropic.com/v1";
  const anthropicMessages = params.messages.map((m) => ({
    role: m.role === "function" ? "user" : m.role === "tool" ? "user" : m.role,
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
  })) as { role: string; content: string }[];
  const tools = (params.tools ?? []).map((t) => ({
    name: t.function.name,
    description: t.function.description || "",
    input_schema: t.function.parameters || { type: "object", properties: {} },
  }));
  const payload: Record<string, unknown> = {
    model: cfg.model || "claude-sonnet-4",
    max_tokens: params.max_tokens ?? params.maxTokens ?? 8192,
    messages: anthropicMessages,
  };
  if (tools.length) payload.tools = tools;
  if ((params.toolChoice || params.tool_choice) && tools.length === 1) payload.tool_choice = { type: "tool", name: tools[0].name };
  const body = (await fetchJson(`${base.replace(/\/$/, "")}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(payload),
  })) as any;

  const toolCalls = (body.content ?? []).filter((b: any) => b.type === "tool_use").map((b: any) => ({
    id: b.id,
    type: "function" as const,
    function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
  }));
  const text = (body.content ?? []).find((b: any) => b.type === "text");
  return {
    id: body.id ?? "",
    created: Math.floor(Date.now() / 1000),
    model: body.model ?? cfg.model ?? "claude-sonnet-4",
    choices: [{
      index: 0,
      message: { role: "assistant" as const, content: text?.text ?? "", tool_calls: toolCalls },
      finish_reason: body.stop_reason ?? null,
    }],
    usage: body.usage ? { prompt_tokens: body.usage.input_tokens, completion_tokens: body.usage.output_tokens, total_tokens: body.usage.input_tokens + body.usage.output_tokens } : undefined,
  };
}

/** Google Gemini GenerateContent → InvokeResult shape */
async function invokeGoogle(cfg: ProviderConfig, params: InvokeParams): Promise<InvokeResult> {
  const apiKey = cfg.apiKey || ENV.forgeApiKey;
  if (!apiKey) throw new Error(`Chave de API Google não configurada`);
  const model = cfg.model || "gemini-2.5-flash";
  const contents = params.messages.map((m) => ({
    role: m.role === "system" ? "user" : m.role === "tool" ? "user" : "model",
    parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
  }));
  const payload: Record<string, unknown> = { contents };
  if (params.tools?.length) {
    payload.tools = [{ functionDeclarations: params.tools.map((t) => ({ name: t.function.name, description: t.function.description || "", parameters: t.function.parameters || { type: "object", properties: {} } })) }];
  }
  const base = cfg.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  const body = (await fetchJson(`${base.replace(/\/$/, "")}/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })) as any;

  const part = body.candidates?.[0]?.content?.parts?.[0] ?? { text: "" };
  const text = typeof part.text === "string" ? part.text : JSON.stringify(part);
  const toolCalls = (body.candidates?.[0]?.content?.parts ?? []).filter((p: any) => p.functionCall).map((p: any) => ({
    id: `gemini-${p.functionCall.name}-${Date.now()}`,
    type: "function" as const,
    function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) },
  }));
  return {
    id: `gemini-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant" as const, content: text, tool_calls: toolCalls }, finish_reason: body.candidates?.[0]?.finishReason ?? null }],
  };
}

/** Unified entry point — the agent loop calls this instead of invokeLLM */
export async function invokeLLMWithProvider(cfg: ProviderConfig, params: InvokeParams): Promise<InvokeResult> {
  if (cfg.provider === "forge") return invokeLLM({ ...params, model: cfg.model || params.model });
  if (cfg.provider === "anthropic") return invokeAnthropic(cfg, params);
  if (cfg.provider === "google") return invokeGoogle(cfg, params);
  return invokeOpenAICompatible(cfg, params);
}

/** Human-readable provider label */
export function providerLabel(p: string): string {
  return { forge: "Manus Forge (embutido)", openai: "OpenAI", anthropic: "Anthropic", google: "Google Gemini", groq: "Groq", openrouter: "OpenRouter", ollama: "Ollama (local)", qwen: "QwenCloud (Alibaba)", custom: "Custom (OpenAI-compat)" }[p] ?? p;
}
