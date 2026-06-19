import {
  FileSpreadsheet,
  FileText,
  Globe,
  Loader2,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import * as mammoth from "mammoth";
import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { streamChat } from "../services/geminiService";
import {
  Attachment,
  ChatMessage,
  GroundingConfig,
  ModelId,
  ThinkingConfig,
} from "../types";
import { MessageBubble } from "./MessageBubble";

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "model",
      text: "Hi! I'm your AI assistant. I can help with analysis, coding, and reading documents (PDF, Word, Excel).",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelId>(
    ModelId.DEEPSEEK_V4_FLASH,
  );
  const [userSecret] = useState((import.meta as any).env.VITE_AES_KEY || "");
  const [grounding, setGrounding] = useState<GroundingConfig>({
    search: false,
  });
  const [deepSeekThinking, setDeepSeekThinking] = useState<ThinkingConfig>({
    enabled: false,
    effort: "high",
  });
  const isDeepSeekSelected =
    selectedModel === ModelId.DEEPSEEK_V4_FLASH ||
    selectedModel === ModelId.DEEPSEEK_V4_PRO;

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [inputText]);

  useEffect(() => {
    if (isDeepSeekSelected && grounding.search) {
      setGrounding((g) => ({ ...g, search: false }));
    }
  }, [isDeepSeekSelected, grounding.search]);

  const processFile = async (file: File) => {
    setIsProcessingFile(true);
    try {
      let attachment: Attachment | null = null;
      const id = Date.now().toString() + Math.random().toString();

      if (file.type.startsWith("image/")) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        attachment = {
          id,
          type: "image",
          mimeType: file.type,
          data: base64.split(",")[1],
          name: file.name,
        };
      } else if (file.type === "application/pdf") {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        attachment = {
          id,
          type: "pdf",
          mimeType: "application/pdf",
          data: base64.split(",")[1],
          name: file.name,
        };
      } else if (file.name.endsWith(".docx")) {
        // Parse Word
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        attachment = {
          id,
          type: "text",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          data: result.value,
          name: file.name,
        };
      } else if (file.name.endsWith(".xlsx")) {
        // Parse Excel
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        let csvContent = "";
        workbook.SheetNames.forEach((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          csvContent += `--- Sheet: ${sheetName} ---\n`;
          csvContent += XLSX.utils.sheet_to_csv(sheet);
          csvContent += "\n\n";
        });
        attachment = {
          id,
          type: "text",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          data: csvContent,
          name: file.name,
        };
      } else if (file.type === "text/plain") {
        const text = await file.text();
        attachment = {
          id,
          type: "text",
          mimeType: "text/plain",
          data: text,
          name: file.name,
        };
      }

      if (attachment) {
        setAttachments((prev) => [...prev, attachment!]);
      } else {
        alert("Unsupported file type: " + file.name);
      }
    } catch (e) {
      console.error("File processing failed", e);
      alert("Failed to read file: " + file.name);
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(processFile);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) processFile(file);
        e.preventDefault();
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      Array.from(e.dataTransfer.files).forEach(processFile);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (
      (!inputText.trim() && attachments.length === 0) ||
      isStreaming ||
      isProcessingFile
    )
      return;

    const userMessage: ChatMessage = {
      role: "user",
      text: inputText,
      attachments: [...attachments], // copy
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setAttachments([]);
    setIsStreaming(true);

    const placeholderId = Date.now();
    setMessages((prev) => [
      ...prev,
      { role: "model", text: "", isLoading: true, id: placeholderId } as any,
    ]);

    try {
      // Reconstruct history for API
      const apiHistory = messages.map((m) => {
        const parts: any[] = [];

        if (m.attachments) {
          m.attachments.forEach((att) => {
            if (
              att.mimeType === "application/pdf" ||
              att.mimeType.startsWith("image/")
            ) {
              parts.push({
                inlineData: { mimeType: att.mimeType, data: att.data },
              });
            } else {
              parts.push({ text: `\n[File: ${att.name}]\n${att.data}\n` });
            }
          });
        }
        if (m.text) parts.push({ text: m.text });

        return {
          role: m.role,
          parts,
        };
      });

      const { stream } = await streamChat(
        selectedModel,
        apiHistory,
        userMessage.text,
        userMessage.attachments || [],
        grounding,
        deepSeekThinking,
        userSecret,
      );

      let fullText = "";
      let searchChunks: any[] = [];
      let finalUsage: any = undefined;

      for await (const chunk of stream) {
        const c = chunk as any;

        const text = c.text || "";
        fullText += text;

        if (c.usageMetadata) {
          finalUsage = c.usageMetadata;
        }

        const ground = c.candidates?.[0]?.groundingMetadata;
        if (ground?.groundingChunks) {
          ground.groundingChunks.forEach((gc: any) => {
            if (gc.web) searchChunks.push(gc.web);
          });
        }

        setMessages((prev) => {
          const newArr = [...prev];
          const lastMsg = newArr[newArr.length - 1];
          lastMsg.isLoading = false;
          lastMsg.text = fullText;
          if (finalUsage) lastMsg.usage = finalUsage;

          if (searchChunks.length > 0) {
            lastMsg.groundingMetadata = {
              search: searchChunks.length > 0 ? searchChunks : undefined,
            };
          }
          return newArr;
        });
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => {
        const newArr = [...prev];
        const lastMsg = newArr[newArr.length - 1];
        lastMsg.isLoading = false;
        lastMsg.text =
          error instanceof Error
            ? `Error: ${error.message}`
            : "Error: Failed to process request.";
        return newArr;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div
      className="flex flex-col h-full w-full max-w-4xl mx-auto"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-[#F5F7F2]/80 flex items-center justify-center border-4 border-dashed border-[#00843D] m-4 rounded-xl">
          <div className="text-2xl font-bold text-[#1F2A24] flex flex-col items-center gap-2">
            <Paperclip size={48} />
            Drop files to attach
          </div>
        </div>
      )}

      {/* Header */}
      <div className="pt-8 px-6 pb-4">
        <h2 className="text-3xl font-bold mb-6">Chat Assistant</h2>

        {/* Controls Container */}
        <div className="bg-[#FFFFFF] p-4 rounded-lg flex flex-wrap gap-4 items-center justify-between border border-[#D7E2D4]">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="flex items-center gap-2 text-sm font-medium text-[#3D4A43]">
              <span>Model:</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as ModelId)}
                className="bg-[#FFFFFF] border border-[#B8C8B3] rounded px-2 py-1 text-[#1F2A24] focus:outline-none focus:border-[#00843D]"
              >
                <option value={ModelId.GEMINI_3_5_FLASH}>Gemini 3.5 Flash</option>
                <option value={ModelId.GEMINI_31_FLASH_LITE}>
                  Gemini 3.1 Flash Lite
                </option>
                <option value={ModelId.GEMINI_31_PRO}>Gemini 3.1 Pro</option>
                <option value={ModelId.DEEPSEEK_V4_FLASH}>
                  DeepSeek V4 Flash
                </option>
                <option value={ModelId.DEEPSEEK_V4_PRO}>DeepSeek V4 Pro</option>
              </select>
            </div>

            <div className="flex gap-4">
              <label
                className={`flex items-center gap-2 text-sm transition-colors ${
                  isDeepSeekSelected
                    ? "cursor-not-allowed text-[#4F5B54]"
                    : "cursor-pointer hover:text-[#1F2A24] text-[#3D4A43]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={grounding.search}
                  disabled={isDeepSeekSelected}
                  onChange={() =>
                    setGrounding((g) => ({ ...g, search: !g.search }))
                  }
                  className="accent-[#00843D] w-4 h-4 rounded"
                />
                <Globe size={14} /> Search
              </label>
            </div>

            {isDeepSeekSelected && (
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-[#3D4A43] cursor-pointer hover:text-[#1F2A24] transition-colors">
                  <input
                    type="checkbox"
                    checked={deepSeekThinking.enabled}
                    onChange={() =>
                      setDeepSeekThinking((t) => ({
                        ...t,
                        enabled: !t.enabled,
                      }))
                    }
                    className="accent-[#00843D] w-4 h-4 rounded"
                  />
                  Thinking
                </label>

                <label
                  className={`flex items-center gap-2 text-sm ${
                    deepSeekThinking.enabled
                      ? "text-[#3D4A43]"
                      : "text-[#7C887F]"
                  }`}
                >
                  <span>Effort:</span>
                  <select
                    value={deepSeekThinking.effort}
                    disabled={!deepSeekThinking.enabled}
                    onChange={(e) =>
                      setDeepSeekThinking((t) => ({
                        ...t,
                        effort: e.target.value as ThinkingConfig["effort"],
                      }))
                    }
                    className="bg-[#FFFFFF] border border-[#B8C8B3] rounded px-2 py-1 text-[#1F2A24] disabled:bg-[#EEF2EA] disabled:text-[#7C887F] focus:outline-none focus:border-[#00843D]"
                  >
                    <option value="high">High</option>
                    <option value="max">Max</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {messages.map((msg, idx) => (
          <MessageBubble key={idx} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 pb-8 bg-[#F5F7F2]">
        {/* Attachment Previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative group bg-[#FFFFFF] border border-[#D7E2D4] rounded-md p-2 flex items-center gap-2 max-w-[200px]"
              >
                {att.type === "image" ? (
                  <img
                    src={`data:${att.mimeType};base64,${att.data}`}
                    alt="Preview"
                    className="w-8 h-8 rounded object-cover"
                  />
                ) : att.name.endsWith(".xlsx") ? (
                  <FileSpreadsheet className="w-8 h-8 text-green-400" />
                ) : att.name.endsWith(".docx") ? (
                  <FileText className="w-8 h-8 text-blue-400" />
                ) : (
                  <FileText className="w-8 h-8 text-red-400" />
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#1F2A24] truncate" title={att.name}>
                    {att.name}
                  </p>
                  <p className="text-[10px] text-[#66736B] uppercase">
                    {att.type === "text" ? "Converted" : att.type}
                  </p>
                </div>

                <button
                  onClick={() => removeAttachment(att.id)}
                  className="absolute -top-2 -right-2 bg-red-500 rounded-full p-0.5 hover:bg-red-600 text-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {isProcessingFile && (
          <div className="mb-2 text-xs text-yellow-400 flex items-center gap-2 animate-pulse">
            <Loader2 size={12} className="animate-spin" />
            Processing file...
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Message assistant... (Shift+Enter for new line)"
              className="w-full bg-[#FFFFFF] text-[#1F2A24] placeholder-[#7C887F] rounded-md px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#00843D] border border-transparent pr-10 resize-none overflow-hidden min-h-[50px] max-h-[200px]"
              disabled={isStreaming}
              rows={1}
              style={{ height: "50px" }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute right-2 bottom-3 p-2 text-[#66736B] hover:text-[#1F2A24] hover:bg-[#D7E2D4] rounded-full transition-colors"
              title="Attach files (Image, PDF, Word, Excel)"
            >
              <Paperclip size={20} />
            </button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            multiple
            accept="image/*,application/pdf,.docx,.xlsx,.txt,.csv"
            className="hidden"
            onChange={handleFileUpload}
          />

          <button
            type="submit"
            disabled={
              (!inputText.trim() && attachments.length === 0) ||
              isStreaming ||
              isProcessingFile
            }
            className="px-6 h-[50px] flex items-center justify-center bg-[#00843D] hover:bg-[#006F34] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md font-semibold transition-colors"
          >
            {isStreaming ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <Send size={20} />
            )}
          </button>
        </form>
        <div className="text-center text-xs text-[#66736B] mt-2">
          Supports: Images, PDF, Word, Excel, Text. Docs are parsed for context.
          Shift+Enter for line breaks.
        </div>
      </div>
    </div>
  );
};
