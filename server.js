import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import CryptoJS from "crypto-js";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
  analyzeStockHandler,
  deleteStockHistoryHandler,
  getStockHistoryHandler,
} from "./server/routes/stock.js";

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

// ─── Stock Routes ──────────────────────────────────────────────────────────
app.post("/api/analyze-stock", analyzeStockHandler);
app.get("/api/stock-history", getStockHistoryHandler);
app.delete("/api/stock-history/:id", deleteStockHistoryHandler);

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
