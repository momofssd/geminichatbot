import CryptoJS from "crypto-js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { genAI, GROUNDING_TOOL } from "../ai.js";
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

// Ensure the directory exists
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
    // Sort by date descending
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
    const today = new Date().toISOString().split("T")[0];

    console.log(
      `[${ticker}] Starting phased analysis with ${modelId} — ${today}`,
    );

    const model = genAI.getGenerativeModel({
      model: modelId || "gemini-3-pro-preview",
      systemInstruction: ANALYST_SYSTEM_INSTRUCTION,
    });

    const phasePrompts = buildPhasePrompts(ticker, today);
    const phaseResults = [];
    const allGroundingChunks = [];
    const allSearchQueries = [];
    let totalTokens = 0;

    // ── Run three focused research phases in parallel for speed ──────────────
    console.log(`[${ticker}] Running phases in parallel...`);
    const phasePromises = phasePrompts.map((p, i) => {
      console.log(`[${ticker}] Phase ${i + 1} started.`);
      return model.generateContent({
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

    // ── Final synthesis call ─────────────────────────────────────────────────
    console.log(`[${ticker}] Running synthesis...`);
    const synthesisPrompt = buildSynthesisPrompt(ticker, phaseResults, today);

    const synthesisResponse = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: synthesisPrompt }] }],
    });

    const synthCandidate = synthesisResponse.response.candidates?.[0];
    totalTokens +=
      synthesisResponse.response.usageMetadata?.totalTokenCount || 0;

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
          content: synthCandidate?.content,
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

    // Save to history automatically
    const id = Date.now().toString();
    const historyEntry = {
      id,
      ticker: ticker.toUpperCase(),
      modelId,
      date: new Date().toISOString(),
      report: responseObj.candidates[0].content.parts[0].text,
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
