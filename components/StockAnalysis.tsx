import {
  Activity,
  DollarSign,
  Loader2,
  Search,
  TrendingUp,
} from "lucide-react";
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { analyzeStock } from "../services/geminiService";

export const StockAnalysis: React.FC = () => {
  const [ticker, setTicker] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userSecret] = useState((import.meta as any).env.VITE_AES_KEY || "");

  const handleAnalyze = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!ticker.trim()) return;

    setIsAnalyzing(true);
    setReport(null);
    setGroundingSources([]);
    setError(null);

    try {
      const response = await analyzeStock(ticker, userSecret);
      if (response.text) setReport(response.text);

      const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        setGroundingSources(
          chunks.map((c: any) => c.web).filter((w: any) => w),
        );
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to analyze stock.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto overflow-y-auto px-6 py-8">
      <div className="mb-12">
        <h2 className="text-3xl font-bold flex items-center gap-3 text-white mb-2">
          <TrendingUp className="text-[#FF4B4B]" size={32} />
          Institutional Research
        </h2>
        <p className="text-gray-500">
          Wall Street grade intelligence with real-time web grounding.
        </p>
      </div>

      <div className="bg-[#262730] p-8 rounded-3xl border border-white/5 mb-8 shadow-xl">
        <form onSubmit={handleAnalyze} className="max-w-2xl mx-auto">
          <div className="relative flex items-center">
            <DollarSign className="absolute left-6 text-gray-400" size={24} />
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="ENTER TICKER (E.G. NVDA)"
              className="w-full bg-black/50 border border-white/10 rounded-full py-5 pl-14 pr-32 text-xl font-black text-white tracking-widest focus:ring-2 focus:ring-[#FF4B4B] outline-none placeholder-gray-700 uppercase"
            />
            <button
              type="submit"
              disabled={!ticker.trim() || isAnalyzing}
              className="absolute right-2.5 top-2.5 bottom-2.5 bg-[#FF4B4B] hover:bg-[#FF3333] text-white px-8 rounded-full font-bold transition-all disabled:opacity-50"
            >
              {isAnalyzing ? <Loader2 className="animate-spin" /> : "ANALYZE"}
            </button>
          </div>
        </form>
        {error && (
          <p className="text-red-400 text-center mt-4 text-sm">{error}</p>
        )}
      </div>

      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-[#262730]/50 p-10 rounded-3xl border border-white/5 relative">
              <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3 uppercase tracking-wider">
                  <Activity size={24} className="text-[#FF4B4B]" />
                  Thesis: {ticker}
                </h3>
              </div>
              <div className="markdown-content text-gray-200 text-lg leading-relaxed">
                <ReactMarkdown>{report}</ReactMarkdown>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <div className="bg-black/50 p-6 rounded-2xl border border-white/5">
              <h4 className="text-xs font-black text-gray-500 mb-6 uppercase tracking-widest flex items-center gap-2">
                <Search size={14} /> Grounding
              </h4>
              <ul className="space-y-4">
                {groundingSources.length > 0 ? (
                  groundingSources.map((s, i) => (
                    <li key={i}>
                      <a
                        href={s.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group"
                      >
                        <p className="text-sm font-bold text-blue-400 group-hover:underline truncate mb-1">
                          {s.title}
                        </p>
                        <p className="text-[10px] text-gray-600 truncate">
                          {s.uri}
                        </p>
                      </a>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-gray-600 italic">
                    No external sources cited.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
