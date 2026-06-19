import CryptoJS from "crypto-js";
import { Attachment, ModelId, ThinkingConfig } from "../types";

export const streamChat = async (
  modelId: string,
  history: { role: string; parts: any[] }[],
  message: string,
  attachments: Attachment[],
  grounding: { search: boolean },
  thinking: ThinkingConfig,
  userSecret: string,
) => {
  const payload = CryptoJS.AES.encrypt(
    JSON.stringify({
      modelId,
      history,
      message,
      attachments,
      grounding,
      thinking,
    }),
    userSecret,
  ).toString();

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p: payload }), // ONLY send the encrypted payload
  });

  if (!response.ok) {
    let errorMessage = "Failed to connect to chat backend";
    try {
      const data = await response.json();
      if (data.error) errorMessage = data.error;
    } catch {
      // Keep the generic connection error when the server did not return JSON.
    }
    throw new Error(errorMessage);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  return {
    stream: (async function* () {
      if (!reader) return;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (!data) continue;
            if (data === "[DONE]") return;
            try {
              const parsed = JSON.parse(data);
              const decoded = CryptoJS.AES.decrypt(
                parsed.t,
                userSecret,
              ).toString(CryptoJS.enc.Utf8);
              yield {
                text: decoded,
              };
            } catch (e) {
              console.error("Error parsing SSE data", e);
            }
          }
        }
      }
    })() as unknown as AsyncIterable<any>,
  };
};

export const getStockHistory = async () => {
  const response = await fetch("/api/stock-history");
  if (!response.ok) throw new Error("Failed to fetch stock history");
  return response.json();
};

export const deleteStockHistory = async (id: string) => {
  const response = await fetch(`/api/stock-history/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete stock history");
  return response.json();
};

export const analyzeStock = async (
  ticker: string,
  userSecret: string,
  saveToHistory: boolean = false,
  modelId: string = ModelId.GEMINI_31_PRO,
) => {
  const payload = CryptoJS.AES.encrypt(
    JSON.stringify({ ticker, saveToHistory, modelId }),
    userSecret,
  ).toString();

  const response = await fetch("/api/analyze-stock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p: payload }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  if (data.t) {
    const decrypted = CryptoJS.AES.decrypt(data.t, userSecret).toString(
      CryptoJS.enc.Utf8,
    );
    const parsedData = JSON.parse(decrypted);

    return {
      text: parsedData.candidates?.[0]?.content?.parts?.[0]?.text || "",
      candidates: parsedData.candidates,
      usage: parsedData.usageMetadata,
    };
  }

  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
    candidates: data.candidates,
    usage: data.usageMetadata,
  };
};
