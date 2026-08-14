/** Live validation of the user-supplied QWEN_API_KEY against QwenCloud */
import { describe, expect, it } from "vitest";
import { invokeLLMWithProvider } from "./nexus-multillm";

const KEY = process.env.QWEN_API_KEY ?? "";

describe("QwenCloud API key validation (live)", () => {
  it("valida a chave com uma chamada simples ao qwen3-turbo", async () => {
    if (!KEY) {
      console.warn("QWEN_API_KEY não definida — pulando validação");
      return;
    }
    const res = await invokeLLMWithProvider(
      { provider: "qwen", apiKey: KEY, baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", model: "qwen-coder-plus" },
      {
        model: "qwen-coder-plus",
        messages: [{ role: "user" as const, content: "Responda em uma palavra: sim ou não. Os testes do NEXUS estão funcionando?" }],
      },
    );
    const text = res.choices?.[0]?.message?.content || "";
    console.log("[qwen] resposta:", JSON.stringify(text).slice(0, 200));
    expect(text.length).toBeGreaterThan(0);
  }, 60_000);
});
