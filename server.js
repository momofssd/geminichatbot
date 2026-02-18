import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import CryptoJS from "crypto-js";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.use(express.static(path.join(__dirname, "dist")));

const port = process.env.PORT || 3001;
const apiKey = process.env.GEMINI_API_KEY;
const AES_KEY = process.env.AES_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY is not set in environment variables");
  process.exit(1);
}

if (!AES_KEY) {
  console.error("AES_KEY is not set in environment variables");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// ─── Grounding tool ──────────────────────────────────────────────────────────
const GROUNDING_TOOL = { googleSearch: {} };

// ─── System instruction that mandates multi-source research ─────────────────
const ANALYST_SYSTEM_INSTRUCTION = `You are a Lead Quantitative Researcher and Systematic Macro Trader at a Tier-1 hedge fund.

RESEARCH MANDATE — NON-NEGOTIABLE:
You MUST search and cite AT LEAST 8–10 distinct, authoritative sources before forming any conclusion.
You are FORBIDDEN from relying on a single source for any data point. Cross-verify all numbers.

Required source categories you MUST consult on every analysis:
1. SEC filings (sec.gov) — 10-K, 10-Q, 8-K, DEF 14A
2. Earnings call transcripts — SeekingAlpha, Motley Fool, or direct IR pages
3. Financial data aggregators — macrotrends.net, stockanalysis.com, wisesheets
4. Real-time news — Reuters, Bloomberg, WSJ, Financial Times (last 30 days)
5. Analyst ratings & price targets — MarketBeat, TipRanks, Benzinga
6. Options & derivatives flow — Unusual Whales, Barchart, Market Chameleon
7. Institutional ownership — 13F filings via WhaleWisdom or sec.gov
8. Macro context — FRED (fred.stlouisfed.org) for relevant macro indicators
9. Competitor benchmarking — at least 2 direct competitors for ratio comparison
10. Technical data — StockCharts or TradingView for price/volume structure

Do not produce generic advice. Every claim must reference a specific number, date, or event.`;

// ─── Phased research prompts ─────────────────────────────────────────────────
function buildPhasePrompts(ticker, today) {
  return [
    // Phase 1: Fundamentals & SEC
    `Today is ${today}. Search SEC EDGAR (sec.gov/cgi-bin/browse-edgar), macrotrends.net, and stockanalysis.com for ${ticker}:
    - Latest 10-K and most recent 10-Q: revenue, net income, EPS (GAAP & adjusted), free cash flow
    - 5-year trend for each metric
    - ROIC vs WACC calculation
    - Debt-to-Equity ratio, interest coverage ratio
    - Compare key ratios (P/E, EV/EBITDA, P/FCF) to 5-year historical percentiles
    - Compare valuation multiples to the top 2 direct competitors
    Return only raw findings with source citations.`,

    // Phase 2: News, Sentiment & Analyst Ratings
    `Today is ${today}. Search Reuters, Bloomberg, WSJ, Financial Times, SeekingAlpha, and Benzinga for ${ticker} news from the last 30 days:
    - Latest earnings call transcript: extract exact management quotes on guidance, margins, and risk factors
    - Count positive vs negative sentiment keywords (e.g. "headwinds", "margin expansion", "guidance cut", "beat", "miss")
    - All analyst upgrades/downgrades in the last 60 days with specific price targets
    - Any significant insider buying or selling (SEC Form 4 filings)
    - Upcoming catalysts: earnings date, product launches, regulatory decisions, macro events
    Assign a Sentiment Score from -1.0 (very bearish) to +1.0 (very bullish) with explicit justification.
    Return only raw findings with source citations.`,

    // Phase 3: Technical, Options & Institutional Flow
    `Today is ${today}. Search StockCharts, Barchart, Unusual Whales, Market Chameleon, and WhaleWisdom for ${ticker}:
    - Current price vs 50-day MA and 200-day MA: calculate Z-score for each
    - ADX value (trend strength), RSI, Bollinger Band position
    - ATR (Average True Range) and current Implied Volatility rank/percentile
    - Key support and resistance levels based on volume profile nodes
    - Recent unusual options activity: large call/put sweeps, notable OI changes
    - Latest 13F filings: top institutional holders, recent position increases/decreases
    - Short interest as % of float and days-to-cover ratio
    Return only raw findings with source citations.`,
  ];
}

// ─── Synthesis prompt ────────────────────────────────────────────────────────
function buildSynthesisPrompt(ticker, phaseResults, today) {
  return `Today is ${today}. Ticker: ${ticker}

You have completed three phases of deep research. Below are your findings:

--- PHASE 1: FUNDAMENTALS & VALUATION ---
${phaseResults[0]}

--- PHASE 2: SENTIMENT, NEWS & CATALYSTS ---
${phaseResults[1]}

--- PHASE 3: TECHNICALS, OPTIONS & INSTITUTIONAL FLOW ---
${phaseResults[2]}

Now synthesize everything into a complete Institutional Investment Thesis covering ALL six dimensions below.
Every claim must reference a specific number, date, or source. Do not repeat generic statements.

1. PERFORMANCE & RISK BENCHMARKING
   - 1Y, 3Y, 5Y total returns vs SPY
   - Sharpe Ratio and Beta
   - Price Z-score vs 50-day MA and 200-day MA (flag if Z > 2.0 or < -2.0)

2. MULTI-FACTOR PROFILE
   - Momentum: 6-month and 12-month price strength vs sector peers
   - Quality: ROIC vs WACC, Debt-to-Equity
   - Value: P/E and EV/EBITDA vs 5-year percentile and competitor benchmarks

3. SENTIMENT & SIGNAL QUANTIFICATION
   - NLP Sentiment Score (-1.0 to +1.0) with keyword breakdown
   - Key quotes from most recent earnings call
   - Analyst consensus, price target range, and recent rating changes

4. TECHNICAL REGIME & INTRADAY VOLATILITY
   - Market regime: Trend-Following (ADX > 25) or Mean-Reverting
   - Key support/resistance levels with volume profile basis
   - Projected intraday range based on ATR and IV

5. TAIL RISK & CATALYST MODELING
   - Historical Maximum Drawdown (MDD)
   - Short interest, put/call ratio, and options flow signals
   - Upcoming catalysts with estimated impact magnitude

6. SYSTEMATIC VERDICT
   - Final Rating: STRONG BUY | ACCUMULATE | NEUTRAL | TRIM | HARD SELL
   - VaR-based justification weighting Factor Profile vs Technical Regime
   - One-paragraph conviction statement`;
}

// ─── /api/chat ────────────────────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  try {
    const { p } = req.body;
    if (!p) return res.status(400).json({ error: "Missing payload" });

    const bytes = CryptoJS.AES.decrypt(p, AES_KEY);
    let decodedPayload;
    try {
      decodedPayload = bytes.toString(CryptoJS.enc.Utf8);
    } catch (e) {
      return res.status(400).json({ error: "Malformed UTF-8 in payload" });
    }

    if (!decodedPayload)
      return res
        .status(400)
        .json({ error: "Failed to decrypt payload or empty result" });

    const { modelId, history, message, attachments, grounding } =
      JSON.parse(decodedPayload);

    const model = genAI.getGenerativeModel({ model: modelId });

    const tools = [];
    if (grounding?.search) tools.push(GROUNDING_TOOL);

    const currentParts = [];
    for (const att of attachments || []) {
      if (
        att.mimeType === "application/pdf" ||
        att.mimeType.startsWith("image/")
      ) {
        currentParts.push({
          inlineData: { mimeType: att.mimeType, data: att.data },
        });
      } else {
        currentParts.push({
          text: `\n[Context from file "${att.name}":]\n${att.data}\n`,
        });
      }
    }
    if (message?.trim()) currentParts.push({ text: message });

    let sanitizedHistory = (history || []).map((h) => ({
      role: h.role === "model" ? "model" : "user",
      parts: Array.isArray(h.parts) ? h.parts : [{ text: h.parts }],
    }));
    const firstUserIndex = sanitizedHistory.findIndex((h) => h.role === "user");
    sanitizedHistory =
      firstUserIndex !== -1 ? sanitizedHistory.slice(firstUserIndex) : [];

    const alternatingHistory = [];
    let lastRole = null;
    for (const msg of sanitizedHistory) {
      if (msg.role !== lastRole) {
        alternatingHistory.push(msg);
        lastRole = msg.role;
      }
    }

    const chat = model.startChat({
      history: alternatingHistory,
      tools: tools.length > 0 ? tools : undefined,
    });

    const result = await chat.sendMessageStream(
      currentParts.length === 1 && currentParts[0].text
        ? currentParts[0].text
        : currentParts,
    );

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of result.stream) {
      let chunkText = "";
      try {
        chunkText = chunk.text();
      } catch (e) {
        console.error("Chunk text error:", e);
      }
      if (chunkText) {
        const encoded = CryptoJS.AES.encrypt(chunkText, AES_KEY).toString();
        res.write(`data: ${JSON.stringify({ t: encoded })}\n\n`);
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Chat Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─── /api/generate-image ──────────────────────────────────────────────────────
app.post("/api/generate-image", async (req, res) => {
  const { prompt, size } = req.body;
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
    });
    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        imageConfig: { imageSize: size, aspectRatio: "1:1" },
      },
    });
    const images = [];
    const candidates = response.response.candidates;
    if (candidates?.[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData?.data)
          images.push(`data:image/png;base64,${part.inlineData.data}`);
      }
    }
    res.json({ images });
  } catch (error) {
    console.error("Image Gen Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─── /api/edit-image ──────────────────────────────────────────────────────────
app.post("/api/edit-image", async (req, res) => {
  const { base64Image, prompt } = req.body;
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });
    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image.split(",")[1],
              },
            },
            { text: prompt },
          ],
        },
      ],
    });
    const images = [];
    const candidates = response.response.candidates;
    if (candidates?.[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData?.data)
          images.push(`data:image/png;base64,${part.inlineData.data}`);
      }
    }
    res.json({ images });
  } catch (error) {
    console.error("Image Edit Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─── /api/analyze-stock  (phased multi-search) ───────────────────────────────
app.post("/api/analyze-stock", async (req, res) => {
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

    // ── Run three focused research phases sequentially ──────────────────────
    for (let i = 0; i < phasePrompts.length; i++) {
      console.log(`[${ticker}] Running Phase ${i + 1}/3...`);
      const phaseResponse = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: phasePrompts[i] }] }],
        tools: [GROUNDING_TOOL],
      });

      const candidate = phaseResponse.response.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || "";
      phaseResults.push(text);

      // Collect grounding metadata from each phase
      const meta = candidate?.groundingMetadata;
      if (meta?.groundingChunks)
        allGroundingChunks.push(...meta.groundingChunks);
      if (meta?.webSearchQueries)
        allSearchQueries.push(...meta.webSearchQueries);

      totalTokens += phaseResponse.response.usageMetadata?.totalTokenCount || 0;

      console.log(
        `[${ticker}] Phase ${i + 1} complete — sources: ${meta?.groundingChunks?.length || 0}, queries: ${meta?.webSearchQueries?.length || 0}`,
      );
    }

    // ── Final synthesis call ─────────────────────────────────────────────────
    console.log(`[${ticker}] Running synthesis...`);
    const synthesisPrompt = buildSynthesisPrompt(ticker, phaseResults, today);

    const synthesisResponse = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: synthesisPrompt }] }],
      // No live search on synthesis — we already have all data in the prompt
    });

    const synthCandidate = synthesisResponse.response.candidates?.[0];
    totalTokens +=
      synthesisResponse.response.usageMetadata?.totalTokenCount || 0;

    // Deduplicate grounding chunks by URI
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

    // Build a response object shaped like the original for frontend compatibility
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
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get("*path", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
