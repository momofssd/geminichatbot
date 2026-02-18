import CryptoJS from "crypto-js";
import { genAI, GROUNDING_TOOL } from "../ai.js";
import { AES_KEY } from "../config.js";
import {
  ANALYST_SYSTEM_INSTRUCTION,
  buildPhasePrompts,
  buildSynthesisPrompt,
} from "../prompts.js";

export const analyzeStockHandler = async (req, res) => {
  const { p } = req.body;
  try {
    const bytes = CryptoJS.AES.decrypt(p, AES_KEY);
    const decodedPayload = bytes.toString(CryptoJS.enc.Utf8);
    const { ticker } = JSON.parse(decodedPayload);
    const today = new Date().toISOString().split("T")[0];

    console.log(`[${ticker}] Starting phased analysis — ${today}`);

    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-preview",
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

    res.json({ t: encryptedResponse });
  } catch (error) {
    console.error("Stock Analysis Error:", error);
    res.status(500).json({ error: error.message });
  }
};
