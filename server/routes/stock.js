import CryptoJS from "crypto-js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  genAI,
  GROUNDING_TOOL,
  GENERATION_CONFIG,
  SYNTHESIS_RESPONSE_SCHEMA,
  normalizeModelId,
} from "../ai.js";
import { AES_KEY } from "../config.js";
import {
  ANALYST_SYSTEM_INSTRUCTION,
  buildPhasePrompts,
  buildSynthesisPrompt,
} from "../prompts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_DIR = path.resolve(process.cwd(), "server/stockSearch");

console.log("Stock History Directory:", HISTORY_DIR);

const ensureDir = async () => {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
    console.log("Stock History Directory ensured at:", HISTORY_DIR);
  } catch (err) {
    console.error("Error creating stockSearch directory:", err);
  }
};
ensureDir();

export const getStockHistoryHandler = async (req, res) => {
  try {
    const files = await fs.readdir(HISTORY_DIR);
    const history = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const content = await fs.readFile(
            path.join(HISTORY_DIR, file),
            "utf8",
          );
          return JSON.parse(content);
        }),
    );
    history.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteStockHistoryHandler = async (req, res) => {
  const { id } = req.params;
  try {
    const filePath = path.join(HISTORY_DIR, `${id}.json`);
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const analyzeStockHandler = async (req, res) => {
  const { p } = req.body;
  try {
    const bytes = CryptoJS.AES.decrypt(p, AES_KEY);
    const decodedPayload = bytes.toString(CryptoJS.enc.Utf8);
    const { ticker, modelId } = JSON.parse(decodedPayload);
    const normalizedModelId = normalizeModelId(modelId, "gemini-3.1-pro-preview");
    const today = new Date().toISOString().split("T")[0];

    console.log(
      `[${ticker}] Starting phased analysis with ${normalizedModelId} — ${today}`,
    );

    // ── Research phases: use grounding tool + low temperature ─────────────────
    // NOTE: Google Search grounding does NOT support response_mime_type JSON,
    // so phases run as plain text. Only the synthesis call uses structured output.
    const researchModel = genAI.getGenerativeModel({
      model: normalizedModelId,
      systemInstruction: ANALYST_SYSTEM_INSTRUCTION,
      generationConfig: GENERATION_CONFIG,
    });

    // ── Synthesis model: structured JSON output, no grounding tool ────────────
    // Structured output (responseMimeType + responseSchema) is incompatible with
    // the googleSearch grounding tool — Gemini API will throw if combined.
    const synthesisModel = genAI.getGenerativeModel({
      model: normalizedModelId,
      systemInstruction: ANALYST_SYSTEM_INSTRUCTION,
      generationConfig: {
        ...GENERATION_CONFIG,
        responseMimeType: "application/json",
        responseSchema: SYNTHESIS_RESPONSE_SCHEMA,
      },
    });

    const phasePrompts = buildPhasePrompts(ticker, today);
    const phaseResults = [];
    const allGroundingChunks = [];
    const allSearchQueries = [];
    let totalTokens = 0;

    // ── Run three focused research phases in parallel ─────────────────────────
    console.log(`[${ticker}] Running phases in parallel...`);
    const phasePromises = phasePrompts.map((p, i) => {
      console.log(`[${ticker}] Phase ${i + 1} started.`);
      return researchModel.generateContent({
        contents: [{ role: "user", parts: [{ text: p }] }],
        tools: [GROUNDING_TOOL],
      });
    });

    const phaseResponses = await Promise.all(phasePromises);

    for (let i = 0; i < phaseResponses.length; i++) {
      const phaseResponse = phaseResponses[i];
      const candidate = phaseResponse.response.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || "";
      phaseResults.push(text);

      const meta = candidate?.groundingMetadata;
      if (meta?.groundingChunks)
        allGroundingChunks.push(...meta.groundingChunks);
      if (meta?.webSearchQueries)
        allSearchQueries.push(...meta.webSearchQueries);

      totalTokens += phaseResponse.response.usageMetadata?.totalTokenCount || 0;
      console.log(`[${ticker}] Phase ${i + 1} results gathered.`);
    }

    // ── Final synthesis: structured JSON, deterministic output ───────────────
    console.log(`[${ticker}] Running synthesis...`);
    const synthesisPrompt = buildSynthesisPrompt(ticker, phaseResults, today);

    const synthesisResponse = await synthesisModel.generateContent({
      contents: [{ role: "user", parts: [{ text: synthesisPrompt }] }],
      // No grounding tool here — incompatible with responseSchema
    });

    const synthCandidate = synthesisResponse.response.candidates?.[0];
    totalTokens +=
      synthesisResponse.response.usageMetadata?.totalTokenCount || 0;

    // Parse and validate the structured JSON output
    let parsedReport;
    try {
      const rawText = synthCandidate?.content?.parts?.[0]?.text || "{}";
      parsedReport = JSON.parse(rawText);
    } catch (parseErr) {
      console.error(`[${ticker}] Failed to parse structured synthesis output:`, parseErr);
      throw new Error("Synthesis model returned malformed JSON. Check schema compatibility.");
    }

    const reportText =
      typeof parsedReport === "string"
        ? parsedReport
        : parsedReport.reportMarkdown ||
          parsedReport.markdown ||
          parsedReport.report ||
          JSON.stringify(parsedReport, null, 2);

    const seen = new Set();
    const dedupedChunks = allGroundingChunks.filter((c) => {
      const uri = c.web?.uri;
      if (!uri || seen.has(uri)) return false;
      seen.add(uri);
      return true;
    });

    console.log(
      `[${ticker}] Analysis complete — total sources: ${dedupedChunks.length}, total queries: ${allSearchQueries.length}, total tokens: ${totalTokens}`,
    );

    const responseObj = {
      candidates: [
        {
          content: {
            // Store both: raw structured JSON for programmatic use, and a flat
            // text representation for backwards-compatible history rendering
            parts: [
              {
                text: reportText,
                structured: parsedReport,
              },
            ],
          },
          groundingMetadata: {
            groundingChunks: dedupedChunks,
            webSearchQueries: [...new Set(allSearchQueries)],
          },
        },
      ],
      usageMetadata: { totalTokenCount: totalTokens },
    };

    const encryptedResponse = CryptoJS.AES.encrypt(
      JSON.stringify(responseObj),
      AES_KEY,
    ).toString();

    const id = Date.now().toString();
    const historyEntry = {
      id,
      ticker: ticker.toUpperCase(),
      modelId,
      date: new Date().toISOString(),
      // Store the parsed object — not just raw text — for consistent re-rendering
      report: reportText,
      structuredReport: parsedReport,
      reportText,
      usage: responseObj.usageMetadata,
      groundingSources:
        responseObj.candidates[0].groundingMetadata.groundingChunks.map(
          (c) => c.web,
        ),
      searchQueries:
        responseObj.candidates[0].groundingMetadata.webSearchQueries,
    };

    const filePath = path.join(HISTORY_DIR, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(historyEntry, null, 2));

    res.json({ t: encryptedResponse });
  } catch (error) {
    console.error("Stock Analysis Error:", error);
    res.status(500).json({ error: error.message });
  }
};
