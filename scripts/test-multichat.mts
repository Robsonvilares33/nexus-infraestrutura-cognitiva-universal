import { multiAgentChat } from "../server/nexus-multichat";
try {
  const r = await multiAgentChat(1053069, { message: "olá, teste rápido", agent: "Código" });
  console.log("OK:", JSON.stringify(r).slice(0, 400));
} catch (e) {
  console.error("FAIL:", e);
}
process.exit(0);
