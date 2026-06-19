import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { chatHandler } from "./server/routes/chat.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.use(express.static(path.join(__dirname, "dist")));

const port = process.env.PORT || 3001;
const AES_KEY = process.env.AES_KEY;

if (!AES_KEY) {
  console.error("AES_KEY is not set in environment variables");
  process.exit(1);
}

app.post("/api/chat", chatHandler);
app.get("/api/health", (req, res) => {
  res.status(200).json({ ok: true });
});
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
