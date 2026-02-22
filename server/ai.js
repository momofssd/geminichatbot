import { GoogleGenerativeAI } from "@google/generative-ai";
import { apiKey } from "./config.js";

export const genAI = new GoogleGenerativeAI(apiKey);

export const GROUNDING_TOOL = { googleSearch: {} };

// ── Determinism config ────────────────────────────────────────────────────────
// temperature: 0.0 = fully deterministic (greedy decoding), range 0.0–2.0
// topP / topK: constrain the sampling pool further
// candidateCount: always 1 — never let the model branch
export const GENERATION_CONFIG = {
  temperature: 0.1, // Near-zero for factual consistency; slight headroom avoids repetition loops
  topP: 0.85,
  topK: 40,
  candidateCount: 1,
  maxOutputTokens: 8192,
};
