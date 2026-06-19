import { useState } from "react";
import { ChatInterface } from "./components/ChatInterface";
import { Sidebar } from "./components/Sidebar";
import { AppMode } from "./types";

function App() {
  const [currentMode, setMode] = useState<AppMode>(AppMode.CHAT);
  // Chat session key to force remount of ChatInterface
  const [chatSessionKey, setChatSessionKey] = useState<number>(0);

  const handleNewChat = () => {
    setChatSessionKey((prev) => prev + 1);
  };

  return (
    <div className="flex h-screen w-screen bg-[#F5F7F2] text-[#1F2A24] overflow-hidden">
      <Sidebar
        currentMode={currentMode}
        setMode={setMode}
        onNewChat={handleNewChat}
      />
      <main className="flex-1 h-full relative">
        <div
          className={`h-full ${currentMode === AppMode.CHAT ? "block" : "hidden"}`}
        >
          <ChatInterface key={chatSessionKey} />
        </div>
      </main>
    </div>
  );
}

export default App;
