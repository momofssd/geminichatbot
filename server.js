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
    const decodedPayload = bytes.toString(CryptoJS.enc.Utf8);
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
      const chunkText = chunk.text();
      const encoded = CryptoJS.AES.encrypt(chunkText, AES_KEY).toString();
      res.write(`data: ${JSON.stringify({ t: encoded })}\n\n`);
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

app.post("/api/generate-slides", async (req, res) => {
  const { topic, count } = req.body;
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            slides: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "Full sentence action title",
                  },
                  content: {
                    type: "array",
                    items: { type: "string" },
                  },
                  speakerNotes: { type: "string" },
                },
                required: ["title", "content"],
              },
            },
            sentiment: {
              type: "string",
              enum: ["positive", "neutral", "negative", "urgent"],
            },
            themeColor: {
              type: "string",
              description: "Hex color code for the theme",
            },
          },
          required: ["slides", "sentiment", "themeColor"],
        },
      },
    });

    const response =
      await model.generateContent(`Create a McKinsey-style management consulting presentation outline about: ${topic}.
    I need exactly ${count} slides.
    
    Style Guidelines:
    1. Titles must be "Action Titles" (complete sentences that summarize the slide's main insight).
    2. Content should be MECE (Mutually Exclusive, Collectively Exhaustive).
    3. Determine the 'sentiment' of the topic (positive, neutral, negative, urgent).
    4. Suggest a professional 'themeColor' hex code based on the sentiment (e.g., Navy for neutral, Red for urgent, Green for growth).
    
    Output JSON.`);

    const text = response.response.text();
    res.json(JSON.parse(text));
  } catch (error) {
    console.error("Slides Gen Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/analyze-stock", async (req, res) => {
  const { ticker } = req.body;
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-preview",
      systemInstruction:
        "You are a world-class financial analyst. Your analysis must be rigorous, citing numbers and specific events. Do not give generic advice.",
    });

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `
    Ticker: ${ticker}
    Role: Lead Quantitative Researcher & Systematic Trader.

    Objective: Provide a data-driven, quantitative-heavy investment thesis. 

    Instructions:
    1. QUANTITATIVE BENCHMARKING: Use Google Search to find 1Y/3Y/5Y returns. Calculate (or find) the Sharpe Ratio and Beta relative to the S&P 500. Identify the stock's Z-score relative to its 50-day and 200-day Moving Averages.
    2. FACTOR PROFILE: Classify the stock based on Quantitative Factors: 
      - Momentum (Price strength vs peers)
      - Quality (ROIC vs WACC, Debt/Equity)
      - Value (P/E and EV/EBITDA percentiles)
    3. SENTIMENT QUANTIFICATION: Search recent news/transcripts. Assign a 'Sentiment Score' (-1.0 to 1.0) based on the frequency of bullish vs. bearish keywords.
    4. TECHNICAL REGIMES: Identify the current market regime (Trend-following or Mean-reverting). List precise Support/Resistance levels based on high-volume nodes.
    5. RISK MODELING: Quantify the 'Maximum Drawdown' risk and any upcoming 'Volatility Catalysts' (Earnings, Macro data, FDA decisions).
    6. SYSTEMATIC VERDICT: Provide a FINAL SIGNAL (BUY, SELL, NEUTRAL) based on an expected Value-at-Risk (VaR) framework.
    `,
            },
          ],
        },
      ],
      tools: [{ googleSearch: {} }],
    });

    res.json(response.response);
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
