import { multiAgentChat } from "../server/nexus-multichat";
try {
  const r = await multiAgentChat(1053069, { message: "Responda em uma frase curta: qual a capital do Brasil?", agent: "Código" });
  console.log("OK agent:", r.agentName, "ragNotes:", r.ragNotes);
  console.log("RESP:", r.response.slice(0, 500));
} catch (e) {
  console.error("FAIL:", (e as Error).message);
}
process.exit(0);
