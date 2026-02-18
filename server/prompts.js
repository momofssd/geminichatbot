export const ANALYST_SYSTEM_INSTRUCTION = `You are a Senior Equity Research Analyst at a Tier-1 hedge fund, with expertise in quantitative factor modeling and fundamental analysis.

RESEARCH MANDATE — NON-NEGOTIABLE:
You MUST search and cite AT LEAST 8–10 distinct, authoritative sources before forming any conclusion.
You are FORBIDDEN from relying on a single source for any data point. Cross-verify all numbers.

Required source categories you MUST consult on every analysis:
1. SEC filings (sec.gov) — 10-K, 10-Q, 8-K, DEF 14A
2. Earnings call transcripts — SeekingAlpha, Motley Fool, or direct IR pages
3. Financial data aggregators — macrotrends.net, stockanalysis.com, wisesheets
4. Real-time news — Reuters, Bloomberg, WSJ, Financial Times (last 30 days)
5. Analyst ratings & price targets — MarketBeat, TipRanks, Benzinga
6. Options & derivatives flow — Unusual Whales, Barchart, Market Chameleon
7. Institutional ownership — 13F filings via WhaleWisdom or sec.gov
8. Macro context — FRED (fred.stlouisfed.org) for relevant macro indicators
9. Competitor benchmarking — at least 2 direct competitors for ratio comparison
10. Technical data — StockCharts or TradingView for price/volume structure

Do not produce generic advice. Every claim must reference a specific number, date, or event.`;

export function buildPhasePrompts(ticker, today) {
  return [
    `Today is ${today}. Search SEC EDGAR (sec.gov/cgi-bin/browse-edgar), macrotrends.net, and stockanalysis.com for ${ticker}:
    - Latest 10-K and most recent 10-Q: revenue, net income, EPS (GAAP & adjusted), free cash flow
    - 5-year trend for each metric
    - ROIC vs WACC calculation
    - Debt-to-Equity ratio, interest coverage ratio
    - Compare key ratios (P/E, EV/EBITDA, P/FCF) to 5-year historical percentiles
    - Compare valuation multiples to the top 2 direct competitors
    Return only raw findings with source citations.`,

    `Today is ${today}. Search Reuters, Bloomberg, WSJ, Financial Times, SeekingAlpha, and Benzinga for ${ticker} news from the last 30 days:
    - Latest earnings call transcript: extract exact management quotes on guidance, margins, and risk factors
    - Count positive vs negative sentiment keywords (e.g. "headwinds", "margin expansion", "guidance cut", "beat", "miss")
    - All analyst upgrades/downgrades in the last 60 days with specific price targets
    - Any significant insider buying or selling (SEC Form 4 filings)
    - Upcoming catalysts: earnings date, product launches, regulatory decisions, macro events
    Assign a Sentiment Score from -1.0 (very bearish) to +1.0 (very bullish) with explicit justification.
    Return only raw findings with source citations.`,

    `Today is ${today}. Search StockCharts, Barchart, Unusual Whales, Market Chameleon, and WhaleWisdom for ${ticker}:
    - Current price vs 50-day MA and 200-day MA: calculate Z-score for each
    - ADX value (trend strength), RSI, Bollinger Band position
    - ATR (Average True Range) and current Implied Volatility rank/percentile
    - Key support and resistance levels based on volume profile nodes
    - Recent unusual options activity: large call/put sweeps, notable OI changes
    - Latest 13F filings: top institutional holders, recent position increases/decreases
    - Short interest as % of float and days-to-cover ratio
    Return only raw findings with source citations.`,
  ];
}

export function buildSynthesisPrompt(ticker, phaseResults, today) {
  return `Today is ${today}. Ticker: ${ticker}

You have completed three phases of deep research. Below are your findings:

--- PHASE 1: FUNDAMENTALS & VALUATION ---
${phaseResults[0]}

--- PHASE 2: SENTIMENT, NEWS & CATALYSTS ---
${phaseResults[1]}

--- PHASE 3: TECHNICALS, OPTIONS & INSTITUTIONAL FLOW ---
${phaseResults[2]}

Now synthesize everything into a complete Institutional Investment Thesis covering ALL six dimensions below.
Every claim must reference a specific number, date, or source. Do not repeat generic statements.

1. PERFORMANCE & RISK BENCHMARKING
   - 1Y, 3Y, 5Y total returns vs SPY
   - Sharpe Ratio and Beta
   - Price Z-score vs 50-day MA and 200-day MA (flag if Z > 2.0 or < -2.0)

2. MULTI-FACTOR PROFILE
   - Momentum: 6-month and 12-month price strength vs sector peers
   - Quality: ROIC vs WACC, Debt-to-Equity
   - Value: P/E and EV/EBITDA vs 5-year percentile and competitor benchmarks

3. SENTIMENT & SIGNAL QUANTIFICATION
   - NLP Sentiment Score (-1.0 to +1.0) with keyword breakdown
   - Key quotes from most recent earnings call
   - Analyst consensus, price target range, and recent rating changes

4. TECHNICAL REGIME & INTRADAY VOLATILITY
   - Market regime: Trend-Following (ADX > 25) or Mean-Reverting
   - Key support/resistance levels with volume profile basis
   - Projected intraday range based on ATR and IV

5. TAIL RISK & CATALYST MODELING
   - Historical Maximum Drawdown (MDD)
   - Short interest, put/call ratio, and options flow signals
   - Upcoming catalysts with estimated impact magnitude

6. SYSTEMATIC VERDICT
   - Final Rating: STRONG BUY | ACCUMULATE | NEUTRAL | TRIM | HARD SELL
   - VaR-based justification weighting Factor Profile vs Technical Regime
   - One-paragraph conviction statement`;
}
