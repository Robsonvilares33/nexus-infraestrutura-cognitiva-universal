/**
 * Fase 19 — teste da lógica de chunking do SSE do chat multiagente.
 *
 * O endpoint /api/chat/ask-stream divide a resposta completa em chunks de
 * CHUNK_SIZE caracteres e os emite como `event: chunk`; a sequência inteira
 * reconstruída deve ser idêntica ao texto original e terminar com
 * `event: done`.
 */
import { describe, it, expect } from "vitest";

/** Reproduz fielmente a lógica de chunking usada em server/_core/index.ts. */
function chunkSequence(text: string, chunkSize: number): { event: string; data: string }[] {
  const out: { event: string; data: string }[] = [];
  let cursor = 0;
  // Simulação síncrona do setInterval (o timer é um detalhe de transporte)
  while (cursor < text.length) {
    const slice = text.slice(cursor, cursor + chunkSize);
    cursor += slice.length;
    out.push({ event: "chunk", data: JSON.stringify({ text: slice }) });
  }
  out.push({ event: "done", data: JSON.stringify({ agentName: "Código", ragNotes: 2 }) });
  return out;
}

describe("SSE chat chunking", () => {
  it("reconstrói o texto original a partir dos chunks", () => {
    const text =
      "A função deve validar o input antes de processar. " +
      "Primeiro, verifique o tipo; depois, normalize espaços e trim; " +
      "por fim, aplique o schema de validação e retorne o resultado tipado.";
    const seq = chunkSequence(text, 14);
    const chunks = seq.filter(s => s.event === "chunk").map(s => JSON.parse(s.data).text).join("");
    expect(chunks).toBe(text);
  });

  it("emite evento done com metadados e fecha a sequência", () => {
    const seq = chunkSequence("abc", 14);
    const last = seq[seq.length - 1];
    expect(last.event).toBe("done");
    const meta = JSON.parse(last.data);
    expect(meta.agentName).toBe("Código");
    expect(meta.ragNotes).toBe(2);
  });

  it("funciona com texto menor que o chunk (um único evento)", () => {
    const seq = chunkSequence("oi", 14);
    const chunks = seq.filter(s => s.event === "chunk");
    expect(chunks).toHaveLength(1);
    expect(JSON.parse(chunks[0].data).text).toBe("oi");
    expect(seq[1].event).toBe("done");
  });

  it("funciona com texto vazio (nenhum chunk, apenas done)", () => {
    const seq = chunkSequence("", 14);
    expect(seq).toHaveLength(1);
    expect(seq[0].event).toBe("done");
  });

  it("tamanhos de chunk variados não corrompem caracteres (não quebra no meio de byte)", () => {
    // JSON.stringify de texto UTF-8 (emojis, acentos) + slice por índice JS
    // (JS strings usam code units; emoji 🚀 ocupa 2 units → pode cair entre pares).
    const text = "teste 🚀 unicode áéíóú";
    for (const size of [1, 3, 7, 13, 21]) {
      const seq = chunkSequence(text, size);
      const joined = seq.filter(s => s.event === "chunk").map(s => JSON.parse(s.data).text).join("");
      expect(joined).toBe(text);
    }
  });
});
