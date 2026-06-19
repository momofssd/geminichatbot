import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
  analyzeStockHandler,
  deleteStockHistoryHandler,
  getStockHistoryHandler,
} from "./server/routes/stock.js";
import { chatHandler } from "./server/routes/chat.js";

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
// ─── /api/chat ────────────────────────────────────────────────────────────────
app.post("/api/chat", chatHandler);

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
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-image-preview",
    });
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
