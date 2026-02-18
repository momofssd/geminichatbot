import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { port } from "./config.js";
import { chatHandler } from "./routes/chat.js";
import { editImageHandler, generateImageHandler } from "./routes/image.js";
import { analyzeStockHandler } from "./routes/stock.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, "../dist")));

// API Routes
app.post("/api/chat", chatHandler);
app.post("/api/generate-image", generateImageHandler);
app.post("/api/edit-image", editImageHandler);
app.post("/api/analyze-stock", analyzeStockHandler);

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
