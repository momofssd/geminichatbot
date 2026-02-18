import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  Activity,
  Clock,
  Cpu,
  Database,
  DollarSign,
  Download,
  Globe,
  Loader2,
  Search,
  Trash2,
  TrendingUp,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { analyzeStock } from "../services/geminiService";

const PHASES = [
  { label: "Fundamentals & SEC Filings", icon: Database },
  { label: "News, Sentiment & Analyst Ratings", icon: Globe },
  { label: "Technicals, Options & Institutional Flow", icon: Activity },
  { label: "Synthesizing Thesis", icon: TrendingUp },
];

export const StockAnalysis: React.FC = () => {
  const [ticker, setTicker] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(-1);
  const [report, setReport] = useState<string | null>(null);
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const reportRef = useRef<HTMLDivElement>(null);
  const [userSecret] = useState((import.meta as any).env.VITE_AES_KEY || "");

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem("stock_analysis_history");
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const saveToHistory = (newEntry: any) => {
    setHistory((prev) => {
      const updated = [newEntry, ...prev].slice(0, 20);
      localStorage.setItem("stock_analysis_history", JSON.stringify(updated));
      return updated;
    });
  };

  const loadFromHistory = (entry: any) => {
    setTicker(entry.ticker);
    setReport(entry.report);
    setGroundingSources(entry.groundingSources || []);
    setSearchQueries(entry.searchQueries || []);
    setUsage(entry.usage);
    setError(null);
  };

  const deleteFromHistory = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setHistory((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      localStorage.setItem("stock_analysis_history", JSON.stringify(updated));
      return updated;
    });
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current || !ticker) return;

    try {
      setIsExporting(true);
      const element = reportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: "#1a1a1a",
        logging: false,
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(
        `Stock_Analysis_${ticker}_${new Date().toISOString().split("T")[0]}.pdf`,
      );
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleAnalyze = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!ticker.trim()) return;

    setIsAnalyzing(true);
    setCurrentPhase(0);
    setReport(null);
    setGroundingSources([]);
    setSearchQueries([]);
    setUsage(null);
    setError(null);

    try {
      const phaseTimer = setInterval(() => {
        setCurrentPhase((prev) => {
          if (prev < PHASES.length - 1) return prev + 1;
          clearInterval(phaseTimer);
          return prev;
        });
      }, 5000);

      const response = await analyzeStock(ticker, userSecret);
      clearInterval(phaseTimer);
      setCurrentPhase(PHASES.length);

      const newReport = response.text || "";
      const newUsage = response.usage || null;
      const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const newSources = chunks
        ? chunks.map((c: any) => c.web).filter((w: any) => w)
        : [];
      const newQueries =
        response.candidates?.[0]?.groundingMetadata?.webSearchQueries || [];

      setReport(newReport);
      setUsage(newUsage);
      setGroundingSources(newSources);
      setSearchQueries(newQueries);

      saveToHistory({
        ticker: ticker.toUpperCase(),
        date: new Date().toISOString(),
        report: newReport,
        usage: newUsage,
        groundingSources: newSources,
        searchQueries: newQueries,
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to analyze stock.");
    } finally {
      setIsAnalyzing(false);
      setCurrentPhase(-1);
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto overflow-y-auto px-6 py-8">
      {/* Header */}
      <div className="mb-12">
        <h2 className="text-3xl font-bold flex items-center gap-3 text-white mb-2">
          <TrendingUp className="text-[#FF4B4B]" size={32} />
          Institutional Research
        </h2>
        <p className="text-gray-500">
          Wall Street grade intelligence with real-time web grounding across
          8–10 authoritative sources.
        </p>
      </div>

      {/* Search bar */}
      <div className="bg-[#262730] p-8 rounded-3xl border border-white/5 mb-8 shadow-xl">
        {history.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            <p className="w-full text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
              Recent History
            </p>
            {history.map((entry, i) => (
              <div
                key={i}
                onClick={() => loadFromHistory(entry)}
                className="group flex items-center gap-2 bg-black/30 hover:bg-black/50 border border-white/5 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
              >
                <Clock size={12} className="text-gray-500" />
                <span className="text-xs font-bold text-gray-300">
                  {entry.ticker}
                </span>
                <button
                  onClick={(e) => deleteFromHistory(e, i)}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
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

      {/* Phase progress indicator */}
      {isAnalyzing && (
        <div className="bg-[#262730]/70 rounded-2xl border border-white/5 p-6 mb-8">
          <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-5">
            Research in Progress — {ticker}
          </p>
          <div className="space-y-3">
            {PHASES.map((phase, i) => {
              const Icon = phase.icon;
              const done = i < currentPhase;
              const active = i === currentPhase;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    active
                      ? "bg-[#FF4B4B]/10 border border-[#FF4B4B]/30"
                      : done
                        ? "opacity-40"
                        : "opacity-20"
                  }`}
                >
                  {active ? (
                    <Loader2
                      size={16}
                      className="text-[#FF4B4B] animate-spin shrink-0"
                    />
                  ) : done ? (
                    <div className="w-4 h-4 rounded-full bg-green-500 shrink-0 flex items-center justify-center">
                      <span className="text-[8px] text-white font-black">
                        ✓
                      </span>
                    </div>
                  ) : (
                    <Icon size={16} className="text-gray-600 shrink-0" />
                  )}
                  <span
                    className={`text-sm font-semibold ${
                      active
                        ? "text-white"
                        : done
                          ? "text-gray-400"
                          : "text-gray-600"
                    }`}
                  >
                    {i + 1}. {phase.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Results */}
      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main report */}
          <div className="lg:col-span-3 space-y-6">
            <div
              ref={reportRef}
              className="bg-[#262730]/50 p-10 rounded-3xl border border-white/5"
            >
              {/* Report header */}
              <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3 uppercase tracking-wider">
                  <Activity size={24} className="text-[#FF4B4B]" />
                  Thesis: {ticker}
                </h3>
                <button
                  onClick={handleDownloadPDF}
                  disabled={isExporting}
                  className="flex items-center gap-2 bg-[#FF4B4B]/10 hover:bg-[#FF4B4B]/20 text-[#FF4B4B] px-4 py-2 rounded-xl border border-[#FF4B4B]/30 transition-all text-sm font-bold disabled:opacity-50"
                >
                  {isExporting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  {isExporting ? "GENERATING..." : "DOWNLOAD PDF"}
                </button>
              </div>

              {/* Report body */}
              <div className="markdown-content text-gray-200 text-lg leading-relaxed">
                <ReactMarkdown>{report}</ReactMarkdown>
              </div>

              {/* Token / compute summary footer */}
              {usage && (
                <div className="mt-10 pt-6 border-t border-white/5">
                  <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">
                    Compute Summary
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-black/40 rounded-xl border border-white/5">
                      <Cpu size={14} className="text-[#FF4B4B] shrink-0" />
                      <div>
                        <p className="text-[9px] text-gray-500 uppercase tracking-widest leading-none mb-1">
                          Total Tokens
                        </p>
                        <p className="text-white font-mono font-bold text-sm leading-none">
                          {(usage.totalTokenCount || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {usage.promptTokenCount !== undefined && (
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-black/40 rounded-xl border border-white/5">
                        <div>
                          <p className="text-[9px] text-gray-500 uppercase tracking-widest leading-none mb-1">
                            Input
                          </p>
                          <p className="text-gray-300 font-mono font-bold text-sm leading-none">
                            {(usage.promptTokenCount || 0).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}

                    {usage.candidatesTokenCount !== undefined && (
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-black/40 rounded-xl border border-white/5">
                        <div>
                          <p className="text-[9px] text-gray-500 uppercase tracking-widest leading-none mb-1">
                            Output
                          </p>
                          <p className="text-gray-300 font-mono font-bold text-sm leading-none">
                            {(usage.candidatesTokenCount || 0).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}

                    {searchQueries.length > 0 && (
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-black/40 rounded-xl border border-white/5">
                        <Search size={14} className="text-[#FF4B4B] shrink-0" />
                        <div>
                          <p className="text-[9px] text-gray-500 uppercase tracking-widest leading-none mb-1">
                            Searches
                          </p>
                          <p className="text-gray-300 font-mono font-bold text-sm leading-none">
                            {searchQueries.length}
                          </p>
                        </div>
                      </div>
                    )}

                    {groundingSources.length > 0 && (
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-black/40 rounded-xl border border-white/5">
                        <Globe size={14} className="text-[#FF4B4B] shrink-0" />
                        <div>
                          <p className="text-[9px] text-gray-500 uppercase tracking-widest leading-none mb-1">
                            Sources
                          </p>
                          <p className="text-gray-300 font-mono font-bold text-sm leading-none">
                            {groundingSources.length}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Search queries used */}
            {searchQueries.length > 0 && (
              <div className="bg-black/50 p-6 rounded-2xl border border-white/5">
                <h4 className="text-xs font-black text-gray-500 mb-4 uppercase tracking-widest flex items-center gap-2">
                  <Search size={14} /> Searches Run ({searchQueries.length})
                </h4>
                <ul className="space-y-2">
                  {searchQueries.map((q, i) => (
                    <li
                      key={i}
                      className="text-[11px] text-gray-400 flex items-start gap-2"
                    >
                      <span className="text-[#FF4B4B] mt-0.5 shrink-0">›</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Grounding sources */}
            <div className="bg-black/50 p-6 rounded-2xl border border-white/5">
              <h4 className="text-xs font-black text-gray-500 mb-6 uppercase tracking-widest flex items-center gap-2">
                <Globe size={14} /> Sources ({groundingSources.length})
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
