import CryptoJS from "crypto-js";
import { genAI, GROUNDING_TOOL } from "../ai.js";
import { AES_KEY } from "../config.js";

export const chatHandler = async (req, res) => {
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
};
