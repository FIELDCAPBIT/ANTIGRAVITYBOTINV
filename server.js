// AlphaFundamental v2.0 — Express Server with Yahoo Finance API
import express from 'express';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --- Yahoo Finance Auth ---
import yahooFinance from 'yahoo-finance2';



async function yahooFetch(url, retries = 3) {
  const [base, query] = url.split('?');
  const params = new URLSearchParams(query);
  const queryOpts = Object.fromEntries(params.entries());
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await yahooFinance._fetch(base, queryOpts, { needsCrumb: true });
    } catch (err) {
      if ((err.message.includes('Too Many Requests') || err.message.includes('invalid json')) && attempt < retries) {
        console.log(`⚠️ 429 Too Many Requests. Retrying in 4s... (Attempt ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }
      throw err;
    }
  }
}

// Serve static files (no-cache for JS/CSS during dev)
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
    const modules = [
      'assetProfile', 'financialData', 'defaultKeyStatistics', 'summaryDetail', 'price',
      'recommendationTrend', 'institutionOwnership', 'insiderHolders',
      'netSharePurchaseActivity', 'calendarEvents', 'earningsTrend'
    ].join(',');

    const tsTypes = [
      'annualTotalRevenue', 'annualOperatingIncome', 'annualNetIncome', 'annualNormalizedEBITDA',
      'annualFreeCashFlow', 'annualOperatingCashFlow', 'annualCapitalExpenditure',
      'annualStockholdersEquity', 'annualLongTermDebt', 'annualTotalDebt',
      'annualCashAndCashEquivalents', 'annualTotalAssets'
    ].join(',');

    const period1 = Math.floor(Date.now() / 1000) - 6 * 365 * 86400;
    const period2 = Math.floor(Date.now() / 1000);

    const [summaryData, tsData] = await Promise.all([
      yahooFetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=${modules}`),
      yahooFetch(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${symbol}?type=${tsTypes}&period1=${period1}&period2=${period2}`)
    ]);

    const r = summaryData?.quoteSummary?.result?.[0];
    if (!r) throw new Error('No data returned for ' + symbol);

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
    const forwardEps = raw(ks.forwardEps);
    // Fallback PEG: PE / (earnings growth % as whole number) if Yahoo doesn't provide it
    if (!pegRatio && trailingPE && earningsGrowth && earningsGrowth > 0.01) {
      pegRatio = trailingPE / (earningsGrowth * 100);
    }

    // --- Parse timeSeries ---
    const tsResults = tsData?.timeseries?.result || [];
    const seriesMap = {};
    for (const s of tsResults) {
      const key = s.meta?.type?.[0];
      if (!key) continue;
      for (const e of (s[key] || [])) {
        const date = e.asOfDate;
        if (!date) continue;
        if (!seriesMap[date]) seriesMap[date] = {};
        seriesMap[date][key] = e.reportedValue?.raw;
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

    // Compute historical revenue growth YoY
    const revenuesByDate = sortedDates.map(d => ({ date: d, rev: seriesMap[d]?.annualTotalRevenue }));

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

      // Revenue growth YoY
      let hRevGrowth = null;
      if (idx < sortedDates.length - 1) {
        const prevRev = seriesMap[sortedDates[idx + 1]]?.annualTotalRevenue;
        if (rev && prevRev && prevRev > 0) hRevGrowth = (rev - prevRev) / prevRev;
      }

      // Earnings growth YoY (for Forward PE and PEG approximation)
      let hEarningsGrowth = null;
      if (idx < sortedDates.length - 1) {
        const prevNI = seriesMap[sortedDates[idx + 1]]?.annualNetIncome;
        if (netInc && prevNI && prevNI > 0) hEarningsGrowth = (netInc - prevNI) / prevNI;
      }

      // Forward PE approximation: PE / (1 + earningsGrowth)
      const hForwardPE = hPE && hEarningsGrowth && hEarningsGrowth > -0.5 ? hPE / (1 + hEarningsGrowth) : null;

      // PEG = trailing PE / (earnings growth % expressed as whole number)
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
    const earningsDate = cal.earnings?.earningsDate?.[0]?.fmt || null;
    const dividendDate = cal.dividendDate?.fmt || null;
    const exDividendDate = cal.exDividendDate?.fmt || null;

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
      const chartData = await yahooFetch(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?range=3y&interval=1wk`);
      const chart = chartData?.chart?.result?.[0];
      if (chart) {
        const closes = chart.indicators?.quote?.[0]?.close || [];
        const timestamps = chart.timestamp || [];
        const validCloses = closes.filter(c => c != null);
        const len = validCloses.length;

        const high52w = Math.max(...validCloses.slice(-52));
        const low52w = Math.min(...validCloses.slice(-52).filter(c => c > 0));
        const currentClose = validCloses[len - 1] || price;

        // SMAs
        const sma100d = len >= 20 ? validCloses.slice(-20).reduce((a, b) => a + b, 0) / 20 : null; // ~20 weeks ≈ 100 days
        const sma200d = len >= 40 ? validCloses.slice(-40).reduce((a, b) => a + b, 0) / 40 : null; // ~40 weeks ≈ 200 days

        // Returns
        const ret1y = len >= 52 ? (currentClose / validCloses[len - 52] - 1) : null;
        const ret3y = len >= 156 ? (currentClose / validCloses[len - 156] - 1) : null;
        const ret1w = len >= 2 ? (currentClose / validCloses[len - 2] - 1) : null;

        // Support/Resistance using pivot points (classic floor pivot)
        const last52 = validCloses.slice(-52);
        const pivotHigh = Math.max(...last52);
        const pivotLow = Math.min(...last52.filter(c => c > 0));
        const pivotClose = currentClose;
        const pivot = (pivotHigh + pivotLow + pivotClose) / 3;
        const support1 = 2 * pivot - pivotHigh;   // S1
        const support2 = pivot - (pivotHigh - pivotLow); // S2
        const resistance1 = 2 * pivot - pivotLow;  // R1
        const resistance2 = pivot + (pivotHigh - pivotLow); // R2
        // Pick closest support below price, closest resistance above
        const support = currentClose > support1 ? support1 : support2;
        const resistance = currentClose < resistance1 ? resistance1 : resistance2;

        // RSI (14 periods on weekly)
        let rsi = null;
        if (len >= 15) {
          let gains = 0, losses = 0;
          const recent = validCloses.slice(-15);
          for (let i = 1; i < recent.length; i++) {
            const diff = recent[i] - recent[i - 1];
            if (diff > 0) gains += diff; else losses -= diff;
          }
          const avgGain = gains / 14, avgLoss = losses / 14;
          rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
        }

        technicals = { high52w, low52w, sma100d, sma200d, ret1y, ret3y, ret1w, support, resistance, pivot, rsi, currentClose };
      }
    } catch (e) { console.log(`  Technical data unavailable for ${symbol}:`, e.message); }

    // --- SPY benchmark ---
    let spyReturn1y = null;
    try {
      const spyData = await yahooFetch(`https://query2.finance.yahoo.com/v8/finance/chart/SPY?range=1y&interval=1wk`);
      const spyCloses = spyData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
      if (spyCloses.length >= 52) spyReturn1y = spyCloses[spyCloses.length - 1] / spyCloses[spyCloses.length - 52] - 1;
      else if (spyCloses.length >= 2) spyReturn1y = spyCloses[spyCloses.length - 1] / spyCloses[0] - 1;
    } catch (e) { /* ignore */ }

    // --- Earnings Quality (from timeSeries) ---
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

    // --- Earnings Revisions (from earningsTrend module) ---
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
          numUp: ee.numberOfAnalystsUp?.raw || 0,
          numDown: ee.numberOfAnalystsDown?.raw || 0
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

    res.json(result);
  } catch (e) {
    console.error(`Error for ${symbol}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- News Search for Weekly Alert ---
app.get('/api/news/:symbol', async (req, res) => {
  try {
    await ensureCrumb();
    const symbol = req.params.symbol.toUpperCase();
    const searchRes = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=5&quotesCount=0&listsCount=0`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Cookie': yfCookies }
    });
    if (!searchRes.ok) throw new Error('News search failed');
    const data = await searchRes.json();
    const news = (data.news || []).slice(0, 5).map(n => ({
      title: n.title, publisher: n.publisher, link: n.link,
      publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : null
    }));
    res.json({ news });
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
