import {
  MessageSquare,
  PlusCircle,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import React from "react";
import { AppMode } from "../types";

interface SidebarProps {
  currentMode: AppMode;
  setMode: (mode: AppMode) => void;
  onNewChat: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentMode,
  setMode,
  onNewChat,
}) => {
  return (
    <div className="w-20 md:w-72 bg-[#FFFFFF] border-r border-[#D7E2D4] flex flex-col h-full transition-all duration-300">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <h1 className="text-xl font-bold text-[#1F2A24] tracking-tight hidden md:block">
            AI Assistant
          </h1>
          <Sparkles className="w-5 h-5 text-[#1F2A24] md:hidden" />
        </div>

        {/* New Chat Button */}
        <button
          onClick={() => {
            setMode(AppMode.CHAT);
            onNewChat();
          }}
          className="w-full flex items-center justify-center gap-2 bg-[#00843D] text-white hover:bg-[#006F34] px-4 py-2 rounded-md transition-colors mb-6 font-semibold text-sm"
        >
          <PlusCircle size={16} />
          <span className="hidden md:block">New Conversation</span>
        </button>

        <div className="space-y-1">
          <div className="text-xs font-semibold text-[#66736B] uppercase tracking-wider mb-2 hidden md:block px-2">
            Apps
          </div>
          <button
            onClick={() => setMode(AppMode.CHAT)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all text-sm ${
              currentMode === AppMode.CHAT
                ? "bg-[#EEF5EA] text-[#005F2F] font-semibold"
                : "text-[#3D4A43] hover:bg-[#EEF5EA]"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden md:block">Chat</span>
          </button>

          <button
            onClick={() => setMode(AppMode.STOCK_ANALYSIS)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all text-sm ${
              currentMode === AppMode.STOCK_ANALYSIS
                ? "bg-[#EEF5EA] text-[#005F2F] font-semibold"
                : "text-[#3D4A43] hover:bg-[#EEF5EA]"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span className="hidden md:block">Stock Analysis</span>
          </button>
        </div>
      </div>

      <div className="mt-auto p-6 border-t border-[#D7E2D4]">
        <div className="hidden md:block">
          <h3 className="text-xs font-semibold text-[#66736B] uppercase tracking-wider mb-2">
            About
          </h3>
          <p className="text-xs text-[#66736B] leading-relaxed">
            Powered by Gemini 3. Flash for speed, Pro for reasoning.
          </p>
        </div>
      </div>
    </div>
  );
};
