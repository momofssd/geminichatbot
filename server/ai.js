import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { apiKey, deepSeekApiKey } from "./config.js";

export const genAI = new GoogleGenerativeAI(apiKey);

export const GROUNDING_TOOL = { googleSearch: {} };
export const DEEPSEEK_CHAT_COMPLETIONS_URL =
  "https://api.deepseek.com/chat/completions";

const DEEPSEEK_MODEL_IDS = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);

const MODEL_ID_ALIASES = new Map([
  ["Gemini 3.5 Flash", "gemini-3.5-flash"],
  ["Gemini 3.1 Flash Lite", "gemini-3.1-flash-lite"],
  ["Gemini 3.1 Flash-Lite", "gemini-3.1-flash-lite"],
  ["Gemini 3.0 Flash", "gemini-3-flash-preview"],
  ["Gemini 3 Flash", "gemini-3-flash-preview"],
  ["Gemini 3.1 Pro", "gemini-3.1-pro-preview"],
  ["Gemini 3.0 Pro", "gemini-3-pro-preview"],
  ["Gemini 3 Pro", "gemini-3-pro-preview"],
  ["DeepSeek V4 Flash", "deepseek-v4-flash"],
  ["DeepSeek V4 Pro", "deepseek-v4-pro"],
]);

export const normalizeModelId = (modelId, fallback = "gemini-3.5-flash") =>
  MODEL_ID_ALIASES.get(modelId) || modelId || fallback;

export const isDeepSeekModel = (modelId) =>
  DEEPSEEK_MODEL_IDS.has(normalizeModelId(modelId, ""));

const partsToText = (parts) => {
  const normalizedParts = Array.isArray(parts) ? parts : [{ text: parts }];
  return normalizedParts
    .map((part) => {
      if (typeof part?.text === "string") return part.text;
      if (part?.inlineData) {
        const mimeType = part.inlineData.mimeType || "binary";
        return `[Previous ${mimeType} attachment omitted. Use a Gemini model to include image or PDF content.]`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
};

const attachmentToDeepSeekText = (attachment) => {
  if (
    attachment.mimeType === "application/pdf" ||
    attachment.mimeType?.startsWith("image/")
  ) {
    throw new Error(
      "DeepSeek chat models in this app support text attachments only. Use a Gemini model for images or PDFs.",
    );
  }

  if (attachment.data) {
    return `\n[Context from file "${attachment.name}":]\n${attachment.data}\n`;
  }

  return "";
};

export const buildDeepSeekMessages = ({ history, message, attachments }) => {
  const messages = [];
  const historyMessages = [];

  for (const item of history || []) {
    const content = partsToText(item.parts).trim();
    if (!content) continue;
    historyMessages.push({
      role: item.role === "model" ? "assistant" : "user",
      content,
    });
  }
  const firstUserIndex = historyMessages.findIndex(
    (item) => item.role === "user",
  );
  if (firstUserIndex !== -1) {
    messages.push(...historyMessages.slice(firstUserIndex));
  }

  const currentContent = [
    ...(attachments || []).map(attachmentToDeepSeekText),
    message?.trim() || "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  if (currentContent) {
    messages.push({ role: "user", content: currentContent });
  }

  return messages;
};

export async function* streamDeepSeekChat({ modelId, messages }) {
  if (!deepSeekApiKey) {
    throw new Error("DS_KEY is not set in environment variables");
  }

  const response = await fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deepSeekApiKey}`,
    },
    body: JSON.stringify({
      model: normalizeModelId(modelId),
      messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const text = await response.text();
      if (text) {
        try {
          const data = JSON.parse(text);
          detail = data.error?.message || data.message || detail;
        } catch {
          detail = text;
        }
      }
    } catch {
      // Keep the HTTP status text when the API response could not be read.
    }
    throw new Error(`DeepSeek API request failed (${response.status}): ${detail}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("DeepSeek API returned an empty stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6).trim();
      if (!data || data === "[DONE]") return;

      const parsed = JSON.parse(data);
      const text = parsed.choices?.[0]?.delta?.content || "";
      if (text) yield text;
    }
  }
}

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
