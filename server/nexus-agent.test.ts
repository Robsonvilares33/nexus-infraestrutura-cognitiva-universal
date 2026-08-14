import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCall } from "./_core/llm";

// --- Mock the whole LLM module: the agent loop behavior is driven entirely by
// the tool-call decisions we script here, so no real API calls happen. ---
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async (params: any) => {
    return (mockInvokeLLM as any)(params);
  }),
  listLLMModels: vi.fn(async () => ({ data: [] })),
}));

// --- Mock db helpers: persist side effects in memory so assertions are deterministic ---
vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    addFeedEvent: vi.fn(async () => undefined),
    addMissionStep: vi.fn(async () => undefined),
    getMemoryByTier: vi.fn(async () => [{ content: "memória-teste: projeto anterior concluído" }]),
    addMemory: vi.fn(async () => undefined),
    updateMission: vi.fn(async () => undefined),
    awardXp: vi.fn(async () => undefined),
    fireMissionWebhooks: vi.fn(async () => undefined),
    addInAppNotification: vi.fn(async () => undefined),
    evaluateAchievements: vi.fn(async () => undefined),
  };
});

import { runAgentLoop } from "./nexus-agent";
import { addFeedEvent, addMissionStep, updateMission } from "./db";

function toolCall(name: string, args: Record<string, unknown>): ToolCall {
  return { id: `call_${name}_${Math.random().toString(36).slice(2, 8)}`, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

const INTERPRET_RESPONSE = {
  choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ interpretedGoal: "analisar dados", complexity: "medium", initialPlan: "coletar e sintetizar" }) }, finish_reason: "stop" }],
} as any;

let mockInvokeLLM: (params: any) => Promise<any>;

// Scripts the sequence of LLM responses. Index 0 = interpretation, 1 = plan (skipped in agent mode),
// remaining entries are loop iterations; the loop stops when a "finish" tool call is received.
function scriptedFlow(finishAfter: number) {
  let iter = 0;
  let seqNo = 0;
  mockInvokeLLM = async (params: any) => {
    seqNo += 1;
    if (!params.tools) return INTERPRET_RESPONSE; // interpretation call (first, no tools)
    // Agent mode: every call has tools; second scripted interpretation response is
    // consumed by the first loop iteration (plan step uses invokeLLM without tools in classic,
    // agent mode goes straight to the loop) — interpretation is the only tool-less call.
    iter += 1;
    if (iter <= finishAfter) {
      const idx = iter - 1;
      const call = [
        toolCall("search_memory", { query_hint: "dados do projeto" }),
        toolCall("save_memory", { content: "insight intermediário salvo pelo agente", tags: ["teste"] }),
        toolCall("ask_agent", { agent: "Pesquisa", subtask: "investigar fontes de dados" }),
      ][idx % 3];
      return { choices: [{ index: 0, message: { role: "assistant", content: "", tool_calls: [call] }, finish_reason: "tool_calls" }] };
    }
    return {
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "",
          tool_calls: [toolCall("finish", { result: "síntese final do agente: 3 ferramentas executadas", confidence: 0.87 })],
        },
        finish_reason: "tool_calls",
      }],
    };
  };
}

const recordedSteps: any[] = [];
const recordedUpdates: any[] = [];

beforeEach(() => {
  recordedSteps.length = 0;
  recordedUpdates.length = 0;
  (addMissionStep as any).mockImplementation(async (missionId: number, data: any) => {
    recordedSteps.push({ missionId, ...data });
    return undefined;
  });
  (updateMission as any).mockImplementation(async (_u: number, missionId: number, data: any) => {
    recordedUpdates.push({ missionId, ...data });
    return undefined;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.resetAllMocks();
});

async function wipeAgentArtifacts() {
  // Same self-cleaning guarantee as the rest of the suite: nothing from this test
  // leaks into the live cognitive feed / missionSteps tables.
  const { getDb } = await import("./db");
  const db = await getDb();
  if (db) {
    try {
      await db.execute(`DELETE FROM missionSteps WHERE detail LIKE '%vitest%' OR detail LIKE '%agent-loop-test%'` as any);
      await db.execute(`DELETE FROM cognitiveFeed WHERE message LIKE '%vitest%' OR message LIKE '%agent-loop-test%'` as any);
    } catch { /* artifact cleanup must never fail the suite */ }
  }
}

afterEach(() => wipeAgentArtifacts());
afterAll(() => wipeAgentArtifacts());

describe("runAgentLoop (Phase 13 — fusão NEXUS × Manus)", () => {
  it(
    "executes the autonomous think-act-observe loop and finishes with a synthesized result",
    async () => {
      scriptedFlow(2); // search_memory + save_memory, then finish
      const result = await runAgentLoop(1, 42, "[vitest] missão de teste do agente loop", { maxIterations: 10 });

      expect(result.result).toContain("síntese final do agente");
      expect(result.confidence).toBe(0.87);
      expect(result.interpretation.interpretedGoal).toBe("analisar dados");

      // Every iteration persists its tool call + tool result as mission steps
      const toolCalls = recordedSteps.filter(s => s.stepType === "tool_call");
      const toolResults = recordedSteps.filter(s => s.stepType === "tool_result");
      expect(toolCalls.length).toBeGreaterThanOrEqual(2);
      expect(toolResults.length).toBeGreaterThanOrEqual(2);
      const names = toolCalls.map(s => s.toolName);
      expect(names).toContain("search_memory");
      expect(names).toContain("save_memory");
      expect(names).toContain("finish");

      // Persistence side effects: mission marked executing then completed
      const statuses = recordedUpdates.map(u => u.status);
      expect(statuses).toContain("executing");
      expect(statuses).toContain("completed");

      // Memory persisted with agent-loop origin tag
      const { addMemory } = await import("./db");
      expect(addMemory).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ origin: "mission", tags: expect.arrayContaining(["agent-loop"]) }),
      );
    },
    60000,
  );

  it(
    "tolerates a tool error: the loop continues and eventually finishes instead of aborting",
    async () => {
      let iter = 0;
      mockInvokeLLM = async (params: any) => {
        if (!params.tools) return INTERPRET_RESPONSE;
        iter += 1;
        if (iter === 1) {
          // First iteration throws inside save_memory (database blip)
          throw new Error("banco indisponível temporariamente");
        }
        return {
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [toolCall("finish", { result: "concluído apesar do erro transitório", confidence: 0.7 })],
            },
            finish_reason: "tool_calls",
          }],
        };
      };

      const result = await runAgentLoop(1, 43, "[vitest] missão tolerante a falha", { maxIterations: 8 });

      expect(result.result).toContain("concluído apesar do erro transitório");
      expect(result.confidence).toBe(0.7);

      // The failure was recorded as an observation (tool_error step) — never thrown up
      const errors = recordedSteps.filter(s => s.stepType === "tool_error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some(e => String(e.detail).includes("banco indisponível"))).toBe(true);

      // And the mission still reached completed, never stuck
      expect(recordedUpdates.map(u => u.status)).toContain("completed");
    },
    60000,
  );

  it(
    "exhausts the iteration cap and synthesizes a fallback result with confidence 0.75",
    async () => {
      mockInvokeLLM = async (params: any) => {
        if (!params.tools) return INTERPRET_RESPONSE;
        // Never returns finish — loop hits the hard cap
        return {
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [toolCall("search_memory", { query_hint: "contexto" })],
            },
            finish_reason: "tool_calls",
          }],
        };
      };

      const result = await runAgentLoop(1, 44, "[vitest] missão sem conclusão explícita", { maxIterations: 4 });

      expect(result.confidence).toBe(0.75);
      expect(result.steps.length).toBe(4);
      expect(recordedSteps.filter(s => s.stepType === "complete").length).toBeGreaterThanOrEqual(1);
      expect(recordedUpdates.map(u => u.status)).toContain("completed");
    },
    60000,
  );

  it(
    "rounds confidence to 3 decimals (prevents DataTooLong) and persists it on the mission",
    async () => {
      scriptedFlow(0); // finish immediately
      const result = await runAgentLoop(1, 45, "[vitest] checagem de arredondamento", { maxIterations: 6 });

      const confStr = String(result.confidence);
      const decimals = confStr.includes(".") ? confStr.split(".")[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(3);

      const completedUpdate = recordedUpdates.find(u => u.status === "completed");
      expect(completedUpdate).toBeDefined();
      const confSaved = String(completedUpdate!.confidence);
      expect(confSaved.includes(".")).toBe(true);
      expect(confSaved.split(".")[1].length).toBeLessThanOrEqual(3);
    },
    60000,
  );

  it(
    "delegates to a NEXUS agent through ask_agent and persists the agent result with the agent name",
    async () => {
      let iter = 0;
      mockInvokeLLM = async (params: any) => {
        if (!params.tools) return INTERPRET_RESPONSE;
        iter += 1;
        if (iter === 1) {
          return {
            choices: [{
              index: 0,
              message: {
                role: "assistant",
                content: "",
                tool_calls: [toolCall("ask_agent", { agent: "Crítica", subtask: "validar hipóteses" })],
              },
              finish_reason: "tool_calls",
            }],
          };
        }
        return {
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [toolCall("finish", { result: "validação da Crítica incorporada", confidence: 0.8 })],
            },
            finish_reason: "tool_calls",
          }],
        };
      };

      const result = await runAgentLoop(1, 46, "[vitest] delegação a agente especialista", { maxIterations: 6 });

      expect(result.result).toContain("validação da Crítica");
      const agentResults = recordedSteps.filter(s => s.stepType === "agent_result");
      expect(agentResults.length).toBe(1);
      expect(agentResults[0].agentName).toBe("Crítica");
    },
    60000,
  );
});
