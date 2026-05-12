// AlphaFundamental v2.0 — Express Server with Yahoo Finance API (v3)
import express from 'express';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --- Yahoo Finance v3 ---
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// --- Global Rate Limiter: max 1 request at a time, min 2.5s gap ---
let lastRequestTime = 0;
const MIN_GAP_MS = 2500;
const requestQueue = [];
let isProcessingQueue = false;

function enqueueYahooCall(fn) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ fn, resolve, reject });
    if (!isProcessingQueue) processQueue();
  });
}

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  while (requestQueue.length > 0) {
    const { fn, resolve, reject } = requestQueue.shift();
    const now = Date.now();
    const wait = Math.max(0, MIN_GAP_MS - (now - lastRequestTime));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRequestTime = Date.now();
    try {
      const result = await fn();
      resolve(result);
    } catch (err) {
      reject(err);
    }
  }
  isProcessingQueue = false;
}

// --- Retry wrapper with exponential backoff ---
async function withRetry(fn, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err.message || err);
      const isRateLimit = msg.includes('Too Many') || msg.includes('429') || msg.includes('invalid json') || msg.includes('Unexpected token');
      if (isRateLimit && attempt < retries) {
        const delay = Math.min(60000, 8000 * Math.pow(2, attempt));
        console.log(`  ⚠️ Rate limited. Waiting ${delay/1000}s... (Attempt ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

// --- In-memory cache with TTL ---
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}
function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// --- Safe Yahoo Finance calls ---
async function fetchQuoteSummary(symbol) {
  const cacheKey = `summary_${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const modules = ['assetProfile', 'financialData', 'defaultKeyStatistics', 'summaryDetail', 'price',
    'recommendationTrend', 'institutionOwnership', 'insiderHolders',
    'netSharePurchaseActivity', 'calendarEvents', 'earningsTrend'];

  const result = await enqueueYahooCall(() => withRetry(() =>
    yahooFinance.quoteSummary(symbol, { modules })
  ));
  setCache(cacheKey, result);
  return result;
}

async function fetchTimeSeries(symbol) {
  const cacheKey = `ts_${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const tsTypes = [
    'annualTotalRevenue', 'annualOperatingIncome', 'annualNetIncome', 'annualNormalizedEBITDA',
    'annualFreeCashFlow', 'annualOperatingCashFlow', 'annualCapitalExpenditure',
    'annualStockholdersEquity', 'annualLongTermDebt', 'annualTotalDebt',
    'annualCashAndCashEquivalents', 'annualTotalAssets'
  ].join(',');

  const period1 = Math.floor(Date.now() / 1000) - 6 * 365 * 86400;
  const period2 = Math.floor(Date.now() / 1000);

  try {
    // Use raw _fetch with query1 (not query2) for annual timeseries data
    const result = await enqueueYahooCall(() => withRetry(() =>
      yahooFinance._fetch(
        `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${symbol}`,
        { type: tsTypes, period1: String(period1), period2: String(period2) }
      )
    ));
    setCache(cacheKey, result);
    return result;
  } catch (e) {
    console.log(`  ⚠️ TimeSeries fallback for ${symbol}: ${e.message}`);
    return null;
  }
}

async function fetchChartData(symbol, range = '3y') {
  const cacheKey = `chart_${symbol}_${range}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - (range === '1y' ? 1 : 3));

  const result = await enqueueYahooCall(() => withRetry(() =>
    yahooFinance.chart(symbol, { period1, interval: '1wk' })
  ));
  setCache(cacheKey, result);
  return result;
}

// Serve static files
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }
}));

function raw(obj) { const v = obj?.raw ?? obj ?? null; return (typeof v === 'number' && isFinite(v)) ? v : null; }

// GET /api/fundamentals/:symbol
app.get('/api/fundamentals/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    // SEQUENTIAL requests to avoid 429
    console.log(`  📊 [1/4] ${symbol} — quoteSummary...`);
    const r = await fetchQuoteSummary(symbol);
    if (!r) throw new Error('No data returned for ' + symbol);

    console.log(`  📊 [2/4] ${symbol} — timeSeries...`);
    const tsRawData = await fetchTimeSeries(symbol);

    const profile = r.assetProfile || {};
    const fd = r.financialData || {};
    const ks = r.defaultKeyStatistics || {};
    const sd = r.summaryDetail || {};
    const p = r.price || {};

    const price = raw(p.regularMarketPrice);
    const marketCap = raw(p.marketCap);
    const shares = raw(ks.sharesOutstanding) || (price && marketCap ? marketCap / price : null);

    const trailingPE = raw(sd.trailingPE);
    const forwardPE = raw(sd.forwardPE) || raw(ks.forwardPE);
    const evEbitda = raw(ks.enterpriseToEbitda);
    const opMargin = raw(fd.operatingMargins);
    const roe = raw(fd.returnOnEquity);
    const fcf = raw(fd.freeCashflow);
    const ev = raw(ks.enterpriseValue);
    const pfcf = fcf && fcf > 0 && marketCap ? marketCap / fcf : null;
    let pegRatio = raw(sd.pegRatio) || raw(ks.pegRatio);
    const revenueGrowth = raw(fd.revenueGrowth);
    const earningsGrowth = raw(fd.earningsGrowth);
    if (!pegRatio && trailingPE && earningsGrowth && earningsGrowth > 0.01) {
      pegRatio = trailingPE / (earningsGrowth * 100);
    }

    // --- Parse timeSeries (v3 returns array of objects) ---
    const seriesMap = {};
    if (Array.isArray(tsRawData)) {
      for (const entry of tsRawData) {
        const date = entry.date || entry.asOfDate;
        if (!date) continue;
        const dateKey = typeof date === 'string' ? date : date.toISOString().split('T')[0];
        if (!seriesMap[dateKey]) seriesMap[dateKey] = {};
        for (const [k, v] of Object.entries(entry)) {
          if (k !== 'date' && k !== 'asOfDate' && k !== 'symbol' && v != null) {
            seriesMap[dateKey][k] = typeof v === 'object' ? (v.raw ?? v) : v;
          }
        }
      }
    } else if (tsRawData?.timeseries?.result) {
      // Fallback for raw _fetch format
      for (const s of tsRawData.timeseries.result) {
        const key = s.meta?.type?.[0];
        if (!key) continue;
        for (const e of (s[key] || [])) {
          const date = e.asOfDate;
          if (!date) continue;
          if (!seriesMap[date]) seriesMap[date] = {};
          seriesMap[date][key] = e.reportedValue?.raw;
        }
      }
    }
    const sortedDates = Object.keys(seriesMap).sort().reverse().slice(0, 5);

    let roic = roe;
    if (sortedDates.length > 0) {
      const latest = seriesMap[sortedDates[0]];
      const opInc = latest.annualOperatingIncome;
      const eq = latest.annualStockholdersEquity || 0;
      const debt = latest.annualTotalDebt || latest.annualLongTermDebt || 0;
      const cash = latest.annualCashAndCashEquivalents || 0;
      const ic = eq + debt - cash;
      if (opInc && ic > 0) roic = (opInc * 0.79) / ic;
    }

    let netDebtEbitda = null;
    if (sortedDates.length > 0) {
      const latest = seriesMap[sortedDates[0]];
      const debt = latest.annualTotalDebt || 0;
      const cash = latest.annualCashAndCashEquivalents || 0;
      const ebitda = latest.annualNormalizedEBITDA;
      if (ebitda && ebitda > 0) netDebtEbitda = (debt - cash) / ebitda;
    }

    const historicalRatios = sortedDates.map((date, idx) => {
      const y = seriesMap[date];
      const rev = y.annualTotalRevenue;
      const opInc = y.annualOperatingIncome;
      const netInc = y.annualNetIncome;
      const ebitda = y.annualNormalizedEBITDA;
      const freeCF = y.annualFreeCashFlow;
      const eq = y.annualStockholdersEquity || 0;
      const debt = y.annualTotalDebt || y.annualLongTermDebt || 0;
      const cash = y.annualCashAndCashEquivalents || 0;

      const hOpMargin = rev && opInc ? opInc / rev : null;
      const ic = eq + debt - cash;
      const hROIC = opInc && ic > 0 ? (opInc * 0.79) / ic : (eq > 0 && netInc ? netInc / eq : null);
      const eps = netInc && shares ? netInc / shares : null;
      const hPE = eps && eps > 0 && price ? price / eps : null;
      const fcfPS = freeCF && shares ? freeCF / shares : null;
      const hPFCF = fcfPS && fcfPS > 0 && price ? price / fcfPS : null;
      const hEvEbitda = ebitda && ebitda > 0 && ev ? ev / ebitda : null;
      const hNetDebtEbitda = ebitda && ebitda > 0 ? (debt - cash) / ebitda : null;

      let hRevGrowth = null;
      if (idx < sortedDates.length - 1) {
        const prevRev = seriesMap[sortedDates[idx + 1]]?.annualTotalRevenue;
        if (rev && prevRev && prevRev > 0) hRevGrowth = (rev - prevRev) / prevRev;
      }
      let hEarningsGrowth = null;
      if (idx < sortedDates.length - 1) {
        const prevNI = seriesMap[sortedDates[idx + 1]]?.annualNetIncome;
        if (netInc && prevNI && prevNI > 0) hEarningsGrowth = (netInc - prevNI) / prevNI;
      }
      const hForwardPE = hPE && hEarningsGrowth && hEarningsGrowth > -0.5 ? hPE / (1 + hEarningsGrowth) : null;
      const hPEG = hPE && hEarningsGrowth && hEarningsGrowth > 0.01 ? hPE / (hEarningsGrowth * 100) : null;

      return { date, priceToEarningsRatio: hPE, priceToFreeCashFlowRatio: hPFCF,
        evToEBITDA: hEvEbitda, returnOnInvestedCapital: hROIC,
        operatingProfitMargin: hOpMargin, netDebtToEBITDA: hNetDebtEbitda,
        revenueGrowth: hRevGrowth, forwardPE: hForwardPE, pegRatio: hPEG };
    });

    // --- Analyst ---
    const analystTargets = {
      targetMeanPrice: raw(fd.targetMeanPrice), targetHighPrice: raw(fd.targetHighPrice),
      targetLowPrice: raw(fd.targetLowPrice), targetMedianPrice: raw(fd.targetMedianPrice),
      numberOfAnalysts: raw(fd.numberOfAnalystOpinions),
      recommendationMean: raw(fd.recommendationMean), recommendationKey: fd.recommendationKey || null
    };
    const recTrend = (r.recommendationTrend?.trend || []).map(t => ({
      period: t.period, strongBuy: t.strongBuy, buy: t.buy, hold: t.hold, sell: t.sell, strongSell: t.strongSell
    }));

    const cal = r.calendarEvents || {};
    const earningsDate = cal.earnings?.earningsDate?.[0]?.fmt || (cal.earnings?.earningsDate?.[0] ? new Date(cal.earnings.earningsDate[0]).toISOString().split('T')[0] : null);
    const dividendDate = cal.dividendDate?.fmt || (cal.dividendDate ? new Date(cal.dividendDate).toISOString().split('T')[0] : null);
    const exDividendDate = cal.exDividendDate?.fmt || (cal.exDividendDate ? new Date(cal.exDividendDate).toISOString().split('T')[0] : null);

    // --- Institutional & Insider ---
    const institutions = (r.institutionOwnership?.ownershipList || []).slice(0, 10).map(i => ({
      name: i.organization, pctHeld: raw(i.pctHeld), reportDate: i.reportDate?.fmt
    }));
    const insiders = (r.insiderHolders?.holders || []).slice(0, 10).map(i => ({
      name: i.name, relation: i.relation, transaction: i.transactionDescription,
      shares: raw(i.latestTransShares), date: i.latestTransDate?.fmt
    }));
    const nspa = r.netSharePurchaseActivity || {};
    const insiderActivity = {
      buyShares: raw(nspa.buyInfoShares), sellShares: raw(nspa.sellInfoShares),
      netShares: raw(nspa.netInfoShares), period: nspa.period?.fmt || '6 months'
    };

    // --- Technical: fetch chart data ---
    let technicals = null;
    try {
      console.log(`  📊 [3/4] ${symbol} — chart...`);
      const chartData = await fetchChartData(symbol, '3y');
      if (chartData && chartData.quotes) {
        const closes = chartData.quotes.map(q => q.close).filter(c => c != null);
        const len = closes.length;
        if (len > 0) {
          const high52w = Math.max(...closes.slice(-52));
          const low52w = Math.min(...closes.slice(-52).filter(c => c > 0));
          const currentClose = closes[len - 1] || price;
          const sma100d = len >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
          const sma200d = len >= 40 ? closes.slice(-40).reduce((a, b) => a + b, 0) / 40 : null;
          const ret1y = len >= 52 ? (currentClose / closes[len - 52] - 1) : null;
          const ret3y = len >= 156 ? (currentClose / closes[len - 156] - 1) : null;
          const ret1w = len >= 2 ? (currentClose / closes[len - 2] - 1) : null;
          const last52 = closes.slice(-52);
          const pivotHigh = Math.max(...last52);
          const pivotLow = Math.min(...last52.filter(c => c > 0));
          const pivot = (pivotHigh + pivotLow + currentClose) / 3;
          const support1 = 2 * pivot - pivotHigh;
          const support2 = pivot - (pivotHigh - pivotLow);
          const resistance1 = 2 * pivot - pivotLow;
          const resistance2 = pivot + (pivotHigh - pivotLow);
          const support = currentClose > support1 ? support1 : support2;
          const resistance = currentClose < resistance1 ? resistance1 : resistance2;
          let rsi = null;
          if (len >= 15) {
            let gains = 0, losses = 0;
            const recent = closes.slice(-15);
            for (let i = 1; i < recent.length; i++) {
              const diff = recent[i] - recent[i - 1];
              if (diff > 0) gains += diff; else losses -= diff;
            }
            const avgGain = gains / 14, avgLoss = losses / 14;
            rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
          }
          technicals = { high52w, low52w, sma100d, sma200d, ret1y, ret3y, ret1w, support, resistance, pivot, rsi, currentClose };
        }
      }
    } catch (e) { console.log(`  Technical data unavailable for ${symbol}:`, e.message); }

    // --- SPY benchmark (cached aggressively: 30min) ---
    let spyReturn1y = null;
    try {
      console.log(`  📊 [4/4] SPY benchmark...`);
      const spyData = await fetchChartData('SPY', '1y');
      if (spyData && spyData.quotes) {
        const spyCloses = spyData.quotes.map(q => q.close).filter(c => c != null);
        if (spyCloses.length >= 52) spyReturn1y = spyCloses[spyCloses.length - 1] / spyCloses[spyCloses.length - 52] - 1;
        else if (spyCloses.length >= 2) spyReturn1y = spyCloses[spyCloses.length - 1] / spyCloses[0] - 1;
      }
    } catch (e) { /* ignore */ }

    // --- Earnings Quality ---
    let earningsQuality = null;
    if (sortedDates.length > 0) {
      const latest = seriesMap[sortedDates[0]];
      const ni = latest.annualNetIncome;
      const ocf = latest.annualOperatingCashFlow;
      const fcfAnn = latest.annualFreeCashFlow;
      const ta = latest.annualTotalAssets;
      earningsQuality = {
        netIncome: ni, operatingCashFlow: ocf, freeCashFlow: fcfAnn, totalAssets: ta,
        cashConversion: (ni && ni !== 0 && fcfAnn != null) ? fcfAnn / ni : null,
        accrualsRatio: (ni != null && ocf != null && ta && ta > 0) ? (ni - ocf) / ta : null
      };
    }

    // --- Earnings Revisions ---
    let earningsRevisions = null;
    const et = r.earningsTrend;
    if (et && et.trend) {
      const trends = et.trend;
      const current0 = trends.find(t => t.period === '0q') || {};
      const currentY = trends.find(t => t.period === '0y') || {};
      const nextY = trends.find(t => t.period === '+1y') || {};
      const extract = (t) => {
        const ee = t.earningsEstimate || {};
        const re = t.revenueEstimate || {};
        return {
          epsEst: raw(ee.avg), epsPrior7d: raw(ee['7daysAgo']),
          epsPrior30d: raw(ee['30daysAgo']), epsPrior90d: raw(ee['90daysAgo']),
          revEst: raw(re.avg), revPrior7d: raw(re['7daysAgo']),
          revPrior30d: raw(re['30daysAgo']), revPrior90d: raw(re['90daysAgo']),
          epsGrowth: raw(ee.growth),
          numUp: ee.numberOfAnalystsUp?.raw || raw(ee.numberOfAnalystsUp) || 0,
          numDown: ee.numberOfAnalystsDown?.raw || raw(ee.numberOfAnalystsDown) || 0
        };
      };
      earningsRevisions = {
        currentQuarter: extract(current0),
        currentYear: extract(currentY),
        nextYear: extract(nextY)
      };
    }

    const result = {
      profile: {
        companyName: p.longName || p.shortName || symbol, price, marketCap,
        beta: raw(ks.beta), lastDividend: raw(sd.dividendRate), dividendYield: raw(sd.dividendYield),
        description: profile.longBusinessSummary || '',
        sector: profile.sector || '', industry: profile.industry || '',
        fullTimeEmployees: profile.fullTimeEmployees || null, country: profile.country || '',
        sharesOutstanding: shares
      },
      quote: { price, name: p.longName || p.shortName },
      ratiosTTM: {
        priceToEarningsRatioTTM: trailingPE, forwardPE,
        priceToFreeCashFlowRatioTTM: pfcf, operatingProfitMarginTTM: opMargin,
        freeCashFlowPerShareTTM: fcf && shares ? fcf / shares : null,
        netIncomePerShareTTM: raw(ks.trailingEps),
        pegRatio, revenueGrowth, earningsGrowth, netDebtToEBITDA: netDebtEbitda
      },
      metricsTTM: {
        evToEBITDATTM: evEbitda, returnOnInvestedCapitalTTM: roic,
        returnOnCapitalEmployedTTM: roic, returnOnEquityTTM: roe,
        freeCashFlowPerShareTTM: fcf && shares ? fcf / shares : null,
        freeCashFlow: fcf, operatingCashFlow: raw(fd.operatingCashflow)
      },
      ratiosHist: historicalRatios, metricsHist: historicalRatios,
      analystTargets, recTrend, earningsDate, dividendDate, exDividendDate,
      institutions, insiders, insiderActivity, technicals, spyReturn1y,
      earningsQuality, earningsRevisions
    };

    console.log(`  ✅ ${symbol} — data served successfully`);
    res.json(result);
  } catch (e) {
    console.error(`Error for ${symbol}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- News Search ---
app.get('/api/news/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const cacheKey = `news_${symbol}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const searchResult = await enqueueYahooCall(() => withRetry(() =>
      yahooFinance.search(symbol, { newsCount: 5, quotesCount: 0 })
    ));
    const news = (searchResult.news || []).slice(0, 5).map(n => ({
      title: n.title, publisher: n.publisher, link: n.link,
      publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : null
    }));
    const result = { news };
    setCache(cacheKey, result);
    res.json(result);
  } catch (e) { res.json({ news: [] }); }
});

// --- Dashboard API ---
const SCORES_FILE = path.join(__dirname, 'scores.json');

app.get('/api/scores', (req, res) => {
  try {
    if (!fs.existsSync(SCORES_FILE)) return res.json({ exists: false });
    const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8'));
    data.exists = true;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/refresh', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  const child = spawn('node', ['updater.js', '--force'], { cwd: __dirname });
  child.stdout.on('data', d => res.write(`data: ${d.toString().replace(/\n/g, '\ndata: ')}\n\n`));
  child.stderr.on('data', d => res.write(`data: [ERR] ${d.toString()}\n\n`));
  child.on('close', code => { res.write(`data: [DONE] exit ${code}\n\n`); res.end(); });
  req.on('close', () => { try { child.kill(); } catch(e){} });
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`\n  🟢 AlphaFundamental v2.0 running at http://localhost:${PORT}\n`);
});
