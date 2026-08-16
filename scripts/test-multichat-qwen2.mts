// Override resolveUserProvider result for the test by bypassing DB
import { addMemory, addFeedEvent, getAgents, getLlmSettings, searchSuperNotes } from "./db";
console.log("qwen key env:", !!process.env.QWEN_API_KEY);
