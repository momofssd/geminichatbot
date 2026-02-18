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

// Serve static files from the Vite build directory
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

app.post("/api/chat", async (req, res) => {
  try {
    const { p } = req.body;
    if (!p) {
      return res.status(400).json({ error: "Missing payload" });
    }

    const bytes = CryptoJS.AES.decrypt(p, AES_KEY);
    let decodedPayload;
    try {
      decodedPayload = bytes.toString(CryptoJS.enc.Utf8);
    } catch (e) {
      console.error("Decryption stringify error:", e);
      return res.status(400).json({ error: "Malformed UTF-8 in payload" });
    }

    if (!decodedPayload) {
      return res
        .status(400)
        .json({ error: "Failed to decrypt payload or empty result" });
    }
    const { modelId, history, message, attachments, grounding } =
      JSON.parse(decodedPayload);

    const model = genAI.getGenerativeModel({ model: modelId });

    const tools = [];
    if (grounding?.search) {
      tools.push({ googleSearch: {} });
    }

    const currentParts = [];
    for (const att of attachments || []) {
      if (
        att.mimeType === "application/pdf" ||
        att.mimeType.startsWith("image/")
      ) {
        currentParts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: att.data,
          },
        });
      } else {
        currentParts.push({
          text: `\n[Context from file "${att.name}":]\n${att.data}\n`,
        });
      }
    }

    if (message?.trim()) {
      currentParts.push({ text: message });
    }

    // Filter history to ensure it alternates correctly and starts with 'user'
    let sanitizedHistory = (history || []).map((h) => ({
      role: h.role === "model" ? "model" : "user",
      parts: Array.isArray(h.parts) ? h.parts : [{ text: h.parts }],
    }));

    // Find the first 'user' message
    const firstUserIndex = sanitizedHistory.findIndex((h) => h.role === "user");
    if (firstUserIndex !== -1) {
      sanitizedHistory = sanitizedHistory.slice(firstUserIndex);
    } else {
      sanitizedHistory = [];
    }

    // Ensure alternating roles: user, model, user, model...
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
        console.error("Error getting chunk text:", e);
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

app.post("/api/generate-image", async (req, res) => {
  const { prompt, size } = req.body;
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
    });
    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        // @ts-ignore
        imageConfig: {
          imageSize: size,
          aspectRatio: "1:1",
        },
      },
    });

    const images = [];
    const candidates = response.response.candidates;
    if (candidates?.[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          images.push(`data:image/png;base64,${part.inlineData.data}`);
        }
      }
    }
    res.json({ images });
  } catch (error) {
    console.error("Image Gen Error:", error);
    res.status(500).json({ error: error.message });
  }
});

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
        if (part.inlineData && part.inlineData.data) {
          images.push(`data:image/png;base64,${part.inlineData.data}`);
        }
      }
    }
    res.json({ images });
  } catch (error) {
    console.error("Image Edit Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/analyze-stock", async (req, res) => {
  const { p } = req.body;
  try {
    const bytes = CryptoJS.AES.decrypt(p, AES_KEY);
    const decodedPayload = bytes.toString(CryptoJS.enc.Utf8);
    const { ticker } = JSON.parse(decodedPayload);

    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-preview",
      systemInstruction:
        "You are a world-class financial analyst. Your analysis must be rigorous, citing numbers and specific events. Do not give generic advice.",
    });

    console.log("Generating analysis for ticker:", ticker);

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `
    Ticker: ${ticker}
    Role: You are acting as a Lead Quantitative Researcher and Systematic Macro Trader at a Tier-1 hedge fund. Your objective is to deliver a high-signal, data-dense investment thesis for a specific equity ticker. You do not provide retail-level "advice"; you provide institutional-grade Systematic Intelligence.

    Instructions:
    When I provide a ticker, perform a deep-dive analysis across the following six quantitative dimensions:

    1. PERFORMANCE & RISK BENCHMARKING
    Returns: Retrieve 1Y, 3Y, and 5Y total returns. Compare these against the S&P 500 (SPY) performance for the same period.

    Risk Metrics: Calculate/Find the Sharpe Ratio (Risk-adjusted return) and Beta (Systemic risk).

    Statistical Deviation: Identify the current price Z-score relative to the 50-day and 200-day Moving Averages. Is the stock in a "Statistical Stretch" (Z > 2.0 or Z < -2.0)?

    2. MULTI-FACTOR PROFILE
    Classify the ticker using the following factor-based systematic framework:

    Momentum: Analyze the 6-month and 12-month price strength relative to its sector peers.

    Quality: Report ROIC (Return on Invested Capital) vs. WACC (Weighted Average Cost of Capital) and the Debt-to-Equity ratio.

    Value: Compare current P/E and EV/EBITDA multiples against their 5-year historical percentiles.

    3. SENTIMENT & SIGNAL QUANTIFICATION
    NLP Analysis: Conduct a search of the most recent earnings call transcripts and news headlines.

    Score: Assign a Sentiment Score (-1.0 to 1.0). Use keyword frequency (e.g., "headwinds," "margin expansion," "guidance cut," "accretive") to weight the score.

    4. TECHNICAL REGIME & INTRADAY VOLATILITY
    Market Regime: Classify the current state as Trend-following (ADX > 25) or Mean-reverting (RSI/Bollinger extremes).

    Structural Levels: Identify precise Support/Resistance levels based on Volume Profile (high-volume nodes) and Fibonacci extensions.

    Intraday Range: Based on current ATR (Average True Range) and IV (Implied Volatility), project the Potential High and Potential Low for the current trading session.

    5. TAIL RISK & CATALYST MODELING
    Drawdown: What is the historical Maximum Drawdown (MDD) for this asset?

    Volatility Catalysts: List upcoming macro/micro events (Earnings, CPI data, Regulatory deadlines) that could trigger a "Gamma Squeeze" or a liquidity event.

    6. SYSTEMATIC VERDICT
    Framework: Use a Value-at-Risk (VaR) mindset.

    Final Signal: Provide a definitive rating: STRONG BUY, ACCUMULATE, NEUTRAL, TRIM, or HARD SELL.

    Logic: Justify the verdict by weighting the Factor Profile vs. Technical Regime.
    `,
            },
          ],
        },
      ],
      tools: [{ googleSearch: {} }],
    });

    const encryptedResponse = CryptoJS.AES.encrypt(
      JSON.stringify(response.response),
      AES_KEY,
    ).toString();
    console.log("Analysis generated successfully for:", ticker);
    res.json({ t: encryptedResponse });
  } catch (error) {
    console.error("Stock Analysis Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Handle SPA routing: serve index.html for any unknown routes
app.get("*path", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
