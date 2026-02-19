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
import {
  analyzeStock,
  deleteStockHistory,
  getStockHistory,
} from "../services/geminiService";

const PHASES = [
  { label: "Fundamentals & SEC Filings", icon: Database },
  { label: "News, Sentiment & Analyst Ratings", icon: Globe },
  { label: "Technicals, Options & Institutional Flow", icon: Activity },
  { label: "Synthesizing Thesis", icon: TrendingUp },
];

const STOCK_MODELS = [
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash", speed: "Fastest" },
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro", speed: "Deep Research" },
];

export const StockAnalysis: React.FC = () => {
  const [ticker, setTicker] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-3-pro-preview");
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
  const pdfRef = useRef<HTMLDivElement>(null);
  const [userSecret] = useState((import.meta as any).env.VITE_AES_KEY || "");

  // Load history from server
  const fetchHistory = async () => {
    try {
      const data = await getStockHistory();
      setHistory(data);
    } catch (e) {
      console.error("Failed to fetch history", e);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const loadFromHistory = (entry: any) => {
    console.log("Loading from history:", entry.ticker);
    setTicker(entry.ticker);
    setReport(entry.report);
    setGroundingSources(entry.groundingSources || []);
    setSearchQueries(entry.searchQueries || []);
    setUsage(entry.usage);
    setError(null);
  };

  const deleteFromHistory = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteStockHistory(id);
      await fetchHistory();
    } catch (e) {
      console.error("Failed to delete history", e);
    }
  };

  const handleDownloadPDF = async () => {
    if (!pdfRef.current || !ticker) return;

    try {
      setIsExporting(true);
      const element = pdfRef.current;
      element.style.display = "block";

      const canvas = await html2canvas(element, {
        scale: 1.5,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
        windowWidth: 800,
      });

      element.style.display = "none";

      const imgData = canvas.toDataURL("image/jpeg", 0.7);
      const pdf = new jsPDF("p", "pt", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const topMargin = 60;
      const bottomMargin = 60;
      const sideMargin = 50;
      const contentWidth = pageWidth - sideMargin * 2;

      const imgProps = pdf.getImageProperties(imgData);
      const imgWidth = contentWidth;
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
      const pageContentHeight = pageHeight - topMargin - bottomMargin;

      let heightLeft = imgHeight;
      let position = 0; // Current position in the source image (pts)
      let pageNum = 1;

      while (heightLeft > 0) {
        if (pageNum > 1) pdf.addPage();

        // Add the image shifted UP by the amount of content we've already shown
        pdf.addImage(
          imgData,
          "JPEG",
          sideMargin,
          topMargin - position,
          imgWidth,
          imgHeight,
          undefined,
          "FAST",
        );

        // Mask the top margin area to hide content from previous pages
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, pageWidth, topMargin, "F");

        // Mask the bottom margin area to hide content meant for next pages
        pdf.rect(0, pageHeight - bottomMargin, pageWidth, bottomMargin, "F");

        position += pageContentHeight;
        heightLeft -= pageContentHeight;
        pageNum++;
      }

      pdf.save(
        `Stock_Analysis_${ticker}_${new Date().toISOString().split("T")[0]}.pdf`,
      );
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsExporting(false);
      if (pdfRef.current) pdfRef.current.style.display = "none";
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

      const response = await analyzeStock(
        ticker,
        userSecret,
        true,
        selectedModel,
      );
      clearInterval(phaseTimer);
      setCurrentPhase(PHASES.length);
      await fetchHistory();

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

      {/* History Bar */}
      {history.length > 0 && (
        <div className="mb-8 overflow-x-auto no-scrollbar pb-2">
          <div className="flex gap-4">
            {history.map((entry, i) => (
              <div
                key={entry.id || i}
                onClick={() => loadFromHistory(entry)}
                className="group relative flex-shrink-0 bg-[#262730] hover:bg-[#2d2e38] border border-white/5 p-4 rounded-2xl cursor-pointer transition-all w-48 shadow-lg overflow-hidden"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-[#FF4B4B]/20 p-1.5 rounded-lg">
                      <TrendingUp size={14} className="text-[#FF4B4B]" />
                    </div>
                    <span className="text-sm font-black text-white">
                      {entry.ticker}
                    </span>
                  </div>
                  <button
                    onClick={(e) => deleteFromHistory(e, entry.id)}
                    className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 flex items-center gap-1">
                  <Clock size={10} />
                  {new Date(entry.date).toLocaleDateString()}
                </p>
                <div className="absolute bottom-0 left-0 h-1 bg-[#FF4B4B]/20 w-0 group-hover:w-full transition-all duration-300" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="bg-[#262730] p-8 rounded-3xl border border-white/5 mb-8 shadow-xl">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-center gap-4 mb-6">
            {STOCK_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedModel(m.id)}
                className={`flex-1 px-4 py-3 rounded-2xl border transition-all text-left ${
                  selectedModel === m.id
                    ? "bg-[#FF4B4B]/10 border-[#FF4B4B] text-white"
                    : "bg-black/20 border-white/5 text-gray-500 hover:border-white/20"
                }`}
              >
                <p className="text-xs font-black uppercase tracking-widest mb-1">
                  {m.label}
                </p>
                <p className="text-[10px] opacity-60 font-medium">{m.speed}</p>
              </button>
            ))}
          </div>

          <form onSubmit={handleAnalyze} className="relative flex items-center">
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
          </form>
        </div>
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
        <>
          {/* Hidden PDF Export Template */}
          <div
            ref={pdfRef}
            style={{
              display: "none",
              width: "800px",
              padding: "40px",
              backgroundColor: "white",
              color: "#333",
              fontFamily: "Arial, sans-serif",
            }}
          >
            <div
              style={{
                borderBottom: "2px solid #333",
                marginBottom: "20px",
                paddingBottom: "10px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h1
                  style={{
                    color: "#333",
                    margin: 0,
                    fontSize: "24px",
                    fontWeight: "bold",
                    letterSpacing: "1px",
                  }}
                >
                  INSTITUTIONAL RESEARCH
                </h1>
                <p
                  style={{
                    margin: 0,
                    fontSize: "10px",
                    color: "#666",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                  }}
                >
                  Equity Research Analysis
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <h2 style={{ margin: 0, fontSize: "20px", color: "#333" }}>
                  {ticker}
                </h2>
                <p style={{ margin: 0, fontSize: "12px", color: "#666" }}>
                  {new Date().toLocaleDateString()}
                </p>
              </div>
            </div>

            <div
              className="pdf-markdown-content"
              style={{ fontSize: "12px", lineHeight: "1.6", color: "#333" }}
            >
              <ReactMarkdown>{report}</ReactMarkdown>
            </div>

            <div
              style={{
                marginTop: "30px",
                paddingTop: "10px",
                borderTop: "1px solid #ddd",
                fontSize: "9px",
                color: "#999",
              }}
            >
              <p>For institutional use only.</p>
              <p>
                This report is generated for informational purposes and does not
                constitute investment advice.
              </p>
            </div>
          </div>

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
                              {(
                                usage.candidatesTokenCount || 0
                              ).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      )}

                      {searchQueries.length > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-black/40 rounded-xl border border-white/5">
                          <Search
                            size={14}
                            className="text-[#FF4B4B] shrink-0"
                          />
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
                          <Globe
                            size={14}
                            className="text-[#FF4B4B] shrink-0"
                          />
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
                        <span className="text-[#FF4B4B] mt-0.5 shrink-0">
                          {"›"}
                        </span>
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
        </>
      )}
    </div>
  );
};
