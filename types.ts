export enum ModelId {
  GEMINI_3_5_FLASH = "gemini-3-flash-preview",
  GEMINI_31_FLASH_LITE = "gemini-3.1-flash-lite",
  GEMINI_31_PRO = "gemini-3.1-pro-preview",
  DEEPSEEK_V4_FLASH = "deepseek-v4-flash",
  DEEPSEEK_V4_PRO = "deepseek-v4-pro",
}

export enum AppMode {
  CHAT = "chat",
  STOCK_ANALYSIS = "stock_analysis",
}

export interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface Attachment {
  id: string;
  type: "image" | "pdf" | "text" | "file";
  mimeType: string;
  data: string; // Base64 for binary, or raw text for parsed files
  name: string;
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
  attachments?: Attachment[];
  groundingMetadata?: {
    search?: { title: string; uri: string }[];
  };
  usage?: UsageMetadata;
  isLoading?: boolean;
}

export interface GroundingConfig {
  search: boolean;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}
