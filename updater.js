// AlphaFundamental — Batch Updater (node updater.js [--force])
// Processes all tickers SEQUENTIALLY with 2s pauses, writes scores.json
import fs from 'fs';
import { TICKER_LIST, TICKERS_DATA, SECTOR_AVERAGES } from './js/tickers.js';
import { calcAverage, calcDeviation } from './js/utils.js';
import { runAnalysis } from './js/analysis.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const FORCE = process.argv.includes('--force');
const SCORES_FILE = './scores.json';
const SKIP_HOURS = 6;

// --- Yahoo Finance Auth (same as server.js) ---
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
        console.log(`    ⚠️ 429 Too Many Requests. Retrying in 30s... (Attempt ${attempt + 1}/${retries})`);
        await sleep(30000);
        continue;
      }
      throw err;
    }
  }
}

function raw(obj) { const v = obj?.raw ?? obj ?? null; return (typeof v === 'number' && isFinite(v)) ? v : null; }
function safe(v) { return (v != null && isFinite(v) && !isNaN(v)) ? v : null; }

// --- Fetch all data for one ticker (mirrors server.js logic) ---
async function fetchTickerData(symbol) {
  const modules = [
    'assetProfile','financialData','defaultKeyStatistics','summaryDetail','price',
    'recommendationTrend','calendarEvents','earningsTrend'
  ].join(',');

  const tsTypes = [
    'annualTotalRevenue','annualOperatingIncome','annualNetIncome','annualNormalizedEBITDA',
    'annualFreeCashFlow','annualOperatingCashFlow','annualCapitalExpenditure',
    'annualStockholdersEquity','annualLongTermDebt','annualTotalDebt','annualCashAndCashEquivalents',
    'annualTotalAssets'
  ].join(',');

  const period1 = Math.floor(Date.now() / 1000) - 6 * 365 * 86400;
  const period2 = Math.floor(Date.now() / 1000);

  const [summaryData, tsData] = await Promise.all([
    yahooFetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=${modules}`),
    yahooFetch(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${symbol}?type=${tsTypes}&period1=${period1}&period2=${period2}`)
  ]);

  const r = summaryData?.quoteSummary?.result?.[0];
  if (!r) throw new Error('No data for ' + symbol);

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
  const fcf = raw(fd.freeCashflow);
  const ev = raw(ks.enterpriseValue);
  const pfcf = fcf && fcf > 0 && marketCap ? marketCap / fcf : null;
  let pegRatio = raw(sd.pegRatio) || raw(ks.pegRatio);
  const revenueGrowth = raw(fd.revenueGrowth);
  const earningsGrowth = raw(fd.earningsGrowth);
  if (!pegRatio && trailingPE && earningsGrowth && earningsGrowth > 0.01) {
    pegRatio = trailingPE / (earningsGrowth * 100);
  }

  // ROIC
  const roe = raw(fd.returnOnEquity);
  const totalDebt = raw(ks.totalDebt) || 0;
  const totalEquity = raw(ks.bookValue) ? raw(ks.bookValue) * (shares || 0) : null;
  let roic = null;
  if (totalEquity && totalEquity > 0) {
    const ic = totalEquity + totalDebt;
    const opInc = opMargin && raw(fd.totalRevenue) ? opMargin * raw(fd.totalRevenue) : null;
    if (opInc && ic > 0) roic = (opInc * 0.79) / ic;
    else if (roe) roic = roe;
  }

  // Net Debt/EBITDA
  let netDebtEbitda = null;
  const ebitda = raw(fd.ebitda);
  const totalCash = raw(fd.totalCash) || 0;
  if (ebitda && ebitda > 0) netDebtEbitda = (totalDebt - totalCash) / ebitda;

  // Time series
  const tsEntries = tsData?.timeseries?.result || [];
  const seriesMap = {};
  for (const ts of tsEntries) {
    const key = ts.meta?.type?.[0];
    if (!key) continue;
    for (const item of (ts[key] || [])) {
      const date = item.asOfDate;
      if (!date) continue;
      if (!seriesMap[date]) seriesMap[date] = {};
      seriesMap[date][key] = item.reportedValue?.raw ?? null;
    }
  }
  const sortedDates = Object.keys(seriesMap).sort().reverse().slice(0, 5);

  const historicalRatios = sortedDates.map((date, idx) => {
    const y = seriesMap[date];
    const rev = y.annualTotalRevenue;
    const opI = y.annualOperatingIncome;
    const netI = y.annualNetIncome;
    const ebd = y.annualNormalizedEBITDA;
    const fcfH = y.annualFreeCashFlow;
    const eq = y.annualStockholdersEquity || 0;
    const dt = y.annualTotalDebt || y.annualLongTermDebt || 0;
    const ca = y.annualCashAndCashEquivalents || 0;

    const hOp = rev && opI ? opI / rev : null;
    const ic = eq + dt - ca;
    const hROIC = opI && ic > 0 ? (opI * 0.79) / ic : (eq > 0 && netI ? netI / eq : null);
    const eps = netI && shares ? netI / shares : null;
    const hPE = eps && eps > 0 && price ? price / eps : null;
    const fPS = fcfH && shares ? fcfH / shares : null;
    const hPFCF = fPS && fPS > 0 && price ? price / fPS : null;
    const hEV = ebd && ebd > 0 && ev ? ev / ebd : null;
    const hNDE = ebd && ebd > 0 ? (dt - ca) / ebd : null;

    let hRevG = null;
    if (idx < sortedDates.length - 1) {
      const prevRev = seriesMap[sortedDates[idx + 1]]?.annualTotalRevenue;
      if (rev && prevRev && prevRev > 0) hRevG = (rev - prevRev) / prevRev;
    }
    let hEG = null;
    if (idx < sortedDates.length - 1) {
      const prevNI = seriesMap[sortedDates[idx + 1]]?.annualNetIncome;
      if (netI && prevNI && prevNI > 0) hEG = (netI - prevNI) / prevNI;
    }
    const hFPE = hPE && hEG && hEG > -0.5 ? hPE / (1 + hEG) : null;
    const hPEG = hPE && hEG && hEG > 0.01 ? hPE / (hEG * 100) : null;

    return { priceToEarningsRatio: hPE, priceToFreeCashFlowRatio: hPFCF,
      evToEBITDA: hEV, returnOnInvestedCapital: hROIC, operatingProfitMargin: hOp,
      netDebtToEBITDA: hNDE, revenueGrowth: hRevG, forwardPE: hFPE, pegRatio: hPEG };
  });

  // Analyst
  const recTrend = r.recommendationTrend?.trend || [];
  const latest = recTrend.find(t => t.period === '0m') || recTrend[0] || {};
  const analystTargets = {
    targetMeanPrice: raw(fd.targetMeanPrice), targetHighPrice: raw(fd.targetHighPrice),
    targetLowPrice: raw(fd.targetLowPrice), targetMedianPrice: raw(fd.targetMedianPrice),
    numberOfAnalysts: raw(fd.numberOfAnalystOpinions),
    recommendationMean: raw(fd.recommendationMean), recommendationKey: fd.recommendationKey || null
  };

  // --- Earnings Quality ---
  let earningsQuality = null;
  if (sortedDates.length > 0) {
    const latestY = seriesMap[sortedDates[0]];
    const ni = latestY.annualNetIncome;
    const ocf = latestY.annualOperatingCashFlow;
    const fcfAnn = latestY.annualFreeCashFlow;
    const ta = latestY.annualTotalAssets;
    let grade = 'media', score = 5;
    const ccr = (ni && ni !== 0 && fcfAnn != null) ? fcfAnn / ni : null;
    const accruals = (ni != null && ocf != null && ta && ta > 0) ? (ni - ocf) / ta : null;
    if (ccr != null) {
      if (ccr > 0.85 && (accruals == null || accruals < 0.05)) score = 9;
      else if (ccr >= 0.60) score = 6;
      else score = 3;
    }
    earningsQuality = { cashConversion: ccr, accrualsRatio: accruals, score };
  }

  // --- Earnings Revisions ---
  let earningsRevisions = null;
  const et = r.earningsTrend;
  if (et && et.trend) {
    const trends = et.trend;
    const cy = trends.find(t => t.period === '0y') || {};
    const extract = (t) => {
      const ee = t.earningsEstimate || {};
      const re = t.revenueEstimate || {};
      return {
        epsEst: raw(ee.avg), epsPrior30d: raw(ee['30daysAgo']), epsPrior90d: raw(ee['90daysAgo']),
        revEst: raw(re.avg), revPrior30d: raw(re['30daysAgo']),
        numUp: ee.numberOfAnalystsUp?.raw || 0, numDown: ee.numberOfAnalystsDown?.raw || 0
      };
    };
    const cyData = extract(cy);
    const epsRev30d = (cyData.epsEst && cyData.epsPrior30d && cyData.epsPrior30d !== 0) ? (cyData.epsEst - cyData.epsPrior30d) / Math.abs(cyData.epsPrior30d) : null;
    const epsRev90d = (cyData.epsEst && cyData.epsPrior90d && cyData.epsPrior90d !== 0) ? (cyData.epsEst - cyData.epsPrior90d) / Math.abs(cyData.epsPrior90d) : null;
    const revRev30d = (cyData.revEst && cyData.revPrior30d && cyData.revPrior30d !== 0) ? (cyData.revEst - cyData.revPrior30d) / Math.abs(cyData.revPrior30d) : null;
    const ratio = (cyData.numUp + cyData.numDown > 0) ? cyData.numUp / (cyData.numUp + cyData.numDown) : null;
    let score = 5;
    if (epsRev30d != null) { if (epsRev30d > 0.02) score += 1.5; else if (epsRev30d < -0.02) score -= 1.5; }
    if (epsRev90d != null) { if (epsRev90d > 0.05) score += 1; else if (epsRev90d < -0.05) score -= 1; }
    if (ratio != null) { if (ratio > 0.7) score += 1.5; else if (ratio < 0.3) score -= 1.5; }
    score = Math.min(10, Math.max(0, score));
    earningsRevisions = { available: true, score };
  }

  return {
    profile: { companyName: p.longName || p.shortName || symbol, price, marketCap,
      beta: raw(ks.beta), dividendYield: raw(sd.dividendYield),
      sector: profile.sector || '', industry: profile.industry || '',
      fullTimeEmployees: profile.fullTimeEmployees || null, country: profile.country || '' },
    quote: { price, name: p.longName || p.shortName },
    ratiosTTM: { priceToEarningsRatioTTM: trailingPE, forwardPE, priceToFreeCashFlowRatioTTM: pfcf,
      operatingProfitMarginTTM: opMargin, freeCashFlowPerShareTTM: fcf && shares ? fcf / shares : null,
      netIncomePerShareTTM: raw(ks.trailingEps), pegRatio, revenueGrowth, earningsGrowth,
      netDebtToEBITDA: netDebtEbitda, week52High: raw(sd.fiftyTwoWeekHigh), week52Low: raw(sd.fiftyTwoWeekLow) },
    metricsTTM: { evToEBITDATTM: evEbitda, returnOnInvestedCapitalTTM: roic,
      returnOnCapitalEmployedTTM: roic, returnOnEquityTTM: roe,
      freeCashFlowPerShareTTM: fcf && shares ? fcf / shares : null },
    ratiosHist: historicalRatios, metricsHist: historicalRatios,
    analystTargets, recTrend: recTrend.map(t => ({ period: t.period, strongBuy: t.strongBuy,
      buy: t.buy, hold: t.hold, sell: t.sell, strongSell: t.strongSell })),
    earningsDate: null, dividendDate: null, exDividendDate: null,
    institutions: [], insiders: [], insiderActivity: { buyShares: null, sellShares: null, netShares: null },
    technicals: null, spyReturn1y: null, earningsQuality, earningsRevisions
  };
}

/// --- Inline analysis (reuses exact scoring logic from analysis.js) ---
function runScoring(ticker, apiData) {
  const result = runAnalysis(ticker, apiData);
  if (!result) return null;

  return {
    ticker, company_name: result.meta.name, sector: result.meta.sector,
    current_price: result.meta.price, market_cap: result.meta.marketCap,
    alpha_score: result.scoring.alphaScore, verdict: result.scoring.verdict, moat_rating: result.moat.rating,
    pe_ratio: result.hist.current.pe, forward_pe: result.hist.current.forwardPE,
    roic: result.hist.current.roic != null ? parseFloat((result.hist.current.roic * 100).toFixed(1)) : null,
    operating_margin: result.hist.current.opMargin != null ? parseFloat((result.hist.current.opMargin * 100).toFixed(1)) : null,
    revenue_growth: result.hist.current.revGrowth,
    analyst_target: result.analyst.targetMean,
    upside_potential: result.analyst.upside != null ? parseFloat((result.analyst.upside * 100).toFixed(1)) : null,
    entry_price: result.entryPrice ? parseFloat(result.entryPrice.toFixed(2)) : null,
    week52_high: result.techData?.week52High || null, week52_low: result.techData?.week52Low || null,
    last_updated: new Date().toISOString(),
    error_flag: false
  };
}

// --- Main ---
async function main() {
  console.log('\n  ╔═══════════════════════════════════════════╗');
  console.log('  ║  AlphaFundamental — Batch Score Updater   ║');
  console.log('  ╚═══════════════════════════════════════════╝\n');
  console.log(`  Mode: ${FORCE ? '--force (actualizar todas)' : 'incremental (skip < 6h)'}`);
  console.log(`  Tickers: ${TICKER_LIST.length}\n`);



  // Load existing scores
  let existing = {};
  if (fs.existsSync(SCORES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8'));
      for (const c of (data.companies || [])) existing[c.ticker] = c;
    } catch (e) { /* ignore */ }
  }

  const results = [];
  let okCount = 0, errCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < TICKER_LIST.length; i++) {
    const t = TICKER_LIST[i];
    const num = `${i + 1}/${TICKER_LIST.length}`;

    // Skip if recently updated
    if (!FORCE && existing[t.ticker] && !existing[t.ticker].error_flag) {
      const lastUp = new Date(existing[t.ticker].last_updated).getTime();
      if (Date.now() - lastUp < SKIP_HOURS * 3600 * 1000) {
        results.push(existing[t.ticker]);
        console.log(`  ${num}: ${t.ticker} ⏭ Skip (actualizado hace < ${SKIP_HOURS}h)`);
        continue;
      }
    }

    try {
      const apiData = await fetchTickerData(t.ticker);
      const scored = runScoring(t.ticker, apiData);
      if (!scored) throw new Error('Scoring returned null');
      results.push(scored);
      okCount++;
      console.log(`  ${num}: ${t.ticker} ✓ — Score: ${scored.alpha_score.toFixed(1)} (${scored.verdict})`);
      await sleep(7000);
    } catch (err) {
      errCount++;
      results.push({
        ticker: t.ticker, company_name: t.name, sector: t.sector,
        current_price: null, market_cap: null, alpha_score: 0, verdict: 'N/A',
        pe_ratio: null, forward_pe: null, roic: null, operating_margin: null,
        revenue_growth: null, analyst_target: null, upside_potential: null,
        week52_high: null, week52_low: null,
        last_updated: new Date().toISOString(), error_flag: true
      });
      console.log(`  ${num}: ${t.ticker} ✗ — Error: ${err.message}`);
      await sleep(3000);
    }
  }

  // Sort by score desc
  results.sort((a, b) => b.alpha_score - a.alpha_score);

  const output = {
    last_updated: new Date().toISOString(),
    total_processed: results.length,
    total_errors: errCount,
    companies: results
  };

  fs.writeFileSync(SCORES_FILE, JSON.stringify(output, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  console.log(`\n  ✅ Completado: ${okCount} OK, ${errCount} errores. Tiempo total: ${mins}m ${secs}s`);
  console.log(`  📁 Guardado en ${SCORES_FILE}\n`);
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
