import CryptoJS from "crypto-js";
import { Attachment, ImageGenSize, PresentationStructure } from "../types";

export const streamChat = async (
  modelId: string,
  history: { role: string; parts: any[] }[],
  message: string,
  attachments: Attachment[],
  grounding: { search: boolean },
  userSecret: string,
) => {
  const payload = CryptoJS.AES.encrypt(
    JSON.stringify({ modelId, history, message, attachments, grounding }),
    userSecret,
  ).toString();

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p: payload }), // ONLY send the encrypted payload
  });

  if (!response.ok) {
    throw new Error("Failed to connect to chat backend");
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

export const generateImage = async (prompt: string, size: ImageGenSize) => {
  const response = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, size }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.images;
};

export const editImage = async (base64Image: string, prompt: string) => {
  const response = await fetch("/api/edit-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64Image, prompt }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.images;
};

export const generateSlideContent = async (
  topic: string,
  count: number,
): Promise<PresentationStructure | null> => {
  const response = await fetch("/api/generate-slides", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, count }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data;
};

export const analyzeStock = async (ticker: string) => {
  const response = await fetch("/api/analyze-stock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  // Re-wrap in an object that mimics the expected structure if necessary
  // The frontend expects a response object that has a text() method or candidates
  return {
    response: {
      text: () => data.candidates?.[0]?.content?.parts?.[0]?.text || "",
      candidates: data.candidates,
    },
  };
};
