import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { apiKey } from "./config.js";

export const genAI = new GoogleGenerativeAI(apiKey);

export const GROUNDING_TOOL = { googleSearch: {} };

const MODEL_ID_ALIASES = new Map([
  ["Gemini 3.5 Flash", "gemini-3.5-flash"],
  ["Gemini 3.0 Flash", "gemini-3-flash-preview"],
  ["Gemini 3 Flash", "gemini-3-flash-preview"],
  ["Gemini 3.1 Pro", "gemini-3.1-pro-preview"],
  ["Gemini 3.0 Pro", "gemini-3-pro-preview"],
  ["Gemini 3 Pro", "gemini-3-pro-preview"],
]);

export const normalizeModelId = (modelId, fallback = "gemini-3.5-flash") =>
  MODEL_ID_ALIASES.get(modelId) || modelId || fallback;

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

export const SYNTHESIS_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    reportMarkdown: {
      type: SchemaType.STRING,
      description:
        "Complete institutional investment thesis in GitHub-flavored Markdown, including sections, tables, citations, tiered entry strategy, and final verdict.",
    },
    finalRating: {
      type: SchemaType.STRING,
      description:
        "One of: STRONG BUY, ACCUMULATE, NEUTRAL, TRIM, HARD SELL.",
    },
    convictionStatement: {
      type: SchemaType.STRING,
      description: "One-paragraph summary of the investment thesis.",
    },
    tieredEntryStrategy: {
      type: SchemaType.ARRAY,
      description: "Three entry scenarios with pricing and execution criteria.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          tier: { type: SchemaType.STRING },
          strategyType: { type: SchemaType.STRING },
          entryPrice: { type: SchemaType.STRING },
          confidenceLevel: { type: SchemaType.STRING },
          rationale: { type: SchemaType.STRING },
          distanceFromCurrent: { type: SchemaType.STRING },
          stopLoss: { type: SchemaType.STRING },
          target: { type: SchemaType.STRING },
        },
        required: [
          "tier",
          "strategyType",
          "entryPrice",
          "confidenceLevel",
          "rationale",
        ],
      },
    },
    sources: {
      type: SchemaType.ARRAY,
      description: "Source names or citation labels used in the report.",
      items: { type: SchemaType.STRING },
    },
  },
  required: [
    "reportMarkdown",
    "finalRating",
    "convictionStatement",
    "tieredEntryStrategy",
    "sources",
  ],
};
