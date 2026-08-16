import { getLlmSettings } from "../server/db";
const llm = await getLlmSettings(1053069);
console.log("userLlmSettings:", JSON.stringify({ provider: llm?.provider, model: llm?.model, hasKey: !!llm?.apiKey }));
import { ENV } from "../server/_core/env";
console.log("env keys:", Object.keys(ENV).filter(k => /key|api/i.test(k)));
