// AlphaFundamental — Batch Updater (node updater.js [--force])
// Processes all tickers SEQUENTIALLY with 2s pauses, writes scores.json
import fs from 'fs';
import { TICKER_LIST, TICKERS_DATA, SECTOR_AVERAGES } from './js/tickers.js';
import { calcAverage, calcDeviation } from './js/utils.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const FORCE = process.argv.includes('--force');
const SCORES_FILE = './scores.json';
const SKIP_HOURS = 6;

// --- Yahoo Finance Auth (same as server.js) ---
let yfCookies = '', yfCrumb = '', yfCrumbTime = 0;
const CRUMB_TTL = 25 * 60 * 1000;
let crumbRefreshing = null;

async function refreshCrumb() {
  const cookieRes = await fetch('https://fc.yahoo.com', { redirect: 'manual' });
  const setCookies = cookieRes.headers.getSetCookie?.() || [];
  yfCookies = setCookies.map(c => c.split(';')[0]).join('; ');
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Cookie': yfCookies }
  });
  if (!crumbRes.ok) throw new Error('Failed to get Yahoo crumb');
  yfCrumb = await crumbRes.text();
  yfCrumbTime = Date.now();
}

async function ensureCrumb(force = false) {
  if (!force && yfCrumb && Date.now() - yfCrumbTime < CRUMB_TTL) return;
  if (crumbRefreshing) return crumbRefreshing;
  crumbRefreshing = refreshCrumb().finally(() => { crumbRefreshing = null; });
  return crumbRefreshing;
}

async function yahooFetch(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    await ensureCrumb(attempt > 0);
    const sep = url.includes('?') ? '&' : '?';
    const full = `${url}${sep}crumb=${encodeURIComponent(yfCrumb)}`;
    const res = await fetch(full, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Cookie': yfCookies }
    });
    if (res.ok) return res.json();
    if (res.status === 401 && attempt < retries) { await sleep(500); continue; }
    throw new Error(`Yahoo ${res.status}: ${res.statusText}`);
  }
}

function raw(obj) { const v = obj?.raw ?? obj ?? null; return (typeof v === 'number' && isFinite(v)) ? v : null; }
function safe(v) { return (v != null && isFinite(v) && !isNaN(v)) ? v : null; }

// --- Fetch all data for one ticker (mirrors server.js logic) ---
async function fetchTickerData(symbol) {
  const modules = [
    'assetProfile','financialData','defaultKeyStatistics','summaryDetail','price',
    'recommendationTrend','calendarEvents'
  ].join(',');

  const tsTypes = [
    'annualTotalRevenue','annualOperatingIncome','annualNetIncome','annualNormalizedEBITDA',
    'annualFreeCashFlow','annualOperatingCashFlow','annualCapitalExpenditure',
    'annualStockholdersEquity','annualLongTermDebt','annualTotalDebt','annualCashAndCashEquivalents'
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
    technicals: null, spyReturn1y: null
  };
}

// --- Inline analysis (reuses exact scoring logic from analysis.js) ---
function runScoring(ticker, apiData) {
  const meta = TICKERS_DATA[ticker];
  if (!meta) return null;
  const { profile, quote, ratiosTTM, ratiosHist, metricsTTM, metricsHist, analystTargets, recTrend } = apiData;

  // Build current metrics
  const current = {
    pe: safe(ratiosTTM?.priceToEarningsRatioTTM),
    forwardPE: safe(ratiosTTM?.forwardPE),
    pfcf: safe(ratiosTTM?.priceToFreeCashFlowRatioTTM),
    evEbitda: safe(metricsTTM?.evToEBITDATTM),
    peg: safe(ratiosTTM?.pegRatio),
    roic: safe(metricsTTM?.returnOnInvestedCapitalTTM) || safe(metricsTTM?.returnOnCapitalEmployedTTM),
    opMargin: safe(ratiosTTM?.operatingProfitMarginTTM),
    revGrowth: safe(ratiosTTM?.revenueGrowth),
    netDebtEbitda: safe(ratiosTTM?.netDebtToEBITDA)
  };

  const pick = (arr, key) => (arr || []).map(r => safe(r[key])).filter(v => v != null && v > 0 && v < 500);
  const pickAny = (arr, key) => (arr || []).map(r => safe(r[key])).filter(v => v != null);

  const avg5y = {
    pe: calcAverage(pick(ratiosHist, 'priceToEarningsRatio')),
    forwardPE: calcAverage(pick(ratiosHist, 'forwardPE')),
    pfcf: calcAverage(pick(ratiosHist, 'priceToFreeCashFlowRatio')),
    evEbitda: calcAverage(pick(metricsHist, 'evToEBITDA')),
    peg: calcAverage(pick(ratiosHist, 'pegRatio')),
    roic: calcAverage(pickAny(metricsHist, 'returnOnInvestedCapital')),
    opMargin: calcAverage(pickAny(ratiosHist, 'operatingProfitMargin')),
    netDebtEbitda: calcAverage(pickAny(metricsHist, 'netDebtToEBITDA')),
    revGrowth: calcAverage(pickAny(ratiosHist, 'revenueGrowth'))
  };

  const deviation = {};
  for (const k of Object.keys(avg5y)) deviation[k] = calcDeviation(current[k], avg5y[k]);

  // Sector comparison
  const sa = SECTOR_AVERAGES[meta.sector] || SECTOR_AVERAGES["Technology"];
  const secDev = {};
  for (const k of Object.keys(sa)) secDev[k] = calcDeviation(current[k], sa[k]);

  // Moat
  let moatS = meta.moatRating === 'Wide' ? 8 : meta.moatRating === 'Narrow' ? 5 : 2;

  // Analyst
  const price = quote?.price ?? profile?.price ?? null;
  const targetMean = analystTargets?.targetMeanPrice;
  const upside = price && targetMean ? (targetMean - price) / price : null;
  const latest = recTrend?.find(t => t.period === '0m') || recTrend?.[0] || {};
  const analystObj = {
    available: !!(analystTargets?.recommendationMean || analystTargets?.numberOfAnalysts),
    targetMean, upside, recommendationMean: analystTargets?.recommendationMean,
    numberOfAnalysts: analystTargets?.numberOfAnalysts
  };

  // Build scoring using same lerp logic
  const lerp = (val, inLow, inHigh, outLow, outHigh) => {
    if (val <= inLow) return outLow; if (val >= inHigh) return outHigh;
    return outLow + (val - inLow) / (inHigh - inLow) * (outHigh - outLow);
  };
  const scoreValDev = (dev) => {
    if (dev == null) return null;
    if (dev <= -0.30) return 10.0;
    if (dev <= -0.10) return lerp(dev, -0.30, -0.10, 10.0, 7.5);
    if (dev <= 0)     return lerp(dev, -0.10, 0, 7.5, 5.0);
    if (dev <= 0.10)  return lerp(dev, 0, 0.10, 5.0, 3.5);
    if (dev <= 0.25)  return lerp(dev, 0.10, 0.25, 3.5, 1.5);
    if (dev <= 0.40)  return lerp(dev, 0.25, 0.40, 1.5, 0.0);
    return 0.0;
  };
  const scoreQualDev = (dev) => {
    if (dev == null) return null;
    if (dev >= 0.30) return 10.0;
    if (dev >= 0.10) return lerp(dev, 0.10, 0.30, 7.5, 10.0);
    if (dev >= 0) return lerp(dev, 0, 0.10, 5.0, 7.5);
    if (dev >= -0.10) return lerp(dev, -0.10, 0, 3.0, 5.0);
    if (dev >= -0.25) return lerp(dev, -0.25, -0.10, 1.0, 3.0);
    return 0.5;
  };
  const avgV = arr => { const v = arr.filter(s => s != null); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 5.0; };

  const histScore = avgV([scoreValDev(deviation.pe), scoreValDev(deviation.pfcf), scoreValDev(deviation.evEbitda), scoreValDev(deviation.forwardPE), scoreValDev(deviation.peg)]);
  const secScore = avgV([scoreValDev(secDev.pe), scoreValDev(secDev.pfcf), scoreValDev(secDev.evEbitda)]);

  let moatBase = meta.moatRating === 'Wide' ? 8.0 : meta.moatRating === 'Narrow' ? 5.0 : 2.0;
  if (current.roic != null) {
    if (current.roic > 0.30) moatBase += 1.5;
    else if (current.roic > 0.20) moatBase += lerp(current.roic, 0.20, 0.30, 0.5, 1.5);
    else if (current.roic > 0.12) moatBase += lerp(current.roic, 0.12, 0.20, 0, 0.5);
    else if (current.roic < 0.08) moatBase -= lerp(current.roic, 0.02, 0.08, 2.0, 0.5);
  }
  if (current.opMargin != null && current.opMargin > 0.25) moatBase += 0.5;
  const moatScore = Math.min(10.0, Math.max(0.0, moatBase));

  const trendScore = avgV([scoreQualDev(deviation.roic), scoreQualDev(deviation.opMargin), scoreQualDev(deviation.revGrowth)]);

  let healthScore = 5.0;
  if (current.netDebtEbitda != null) {
    const nde = current.netDebtEbitda;
    if (nde < 0) healthScore = 10.0;
    else if (nde <= 1) healthScore = lerp(nde, 0, 1, 10, 8);
    else if (nde <= 2) healthScore = lerp(nde, 1, 2, 8, 6.5);
    else if (nde <= 3) healthScore = lerp(nde, 2, 3, 6.5, 4.5);
    else if (nde <= 5) healthScore = lerp(nde, 3, 5, 4.5, 2);
    else healthScore = Math.max(0.5, lerp(nde, 5, 8, 2, 0.5));
  }

  let analystScore = 5.0;
  if (analystObj.available) {
    let recScore = 5.0;
    const rm = analystObj.recommendationMean;
    if (rm != null) {
      if (rm <= 1) recScore = 10; else if (rm <= 2) recScore = lerp(rm, 1, 2, 10, 7.5);
      else if (rm <= 2.5) recScore = lerp(rm, 2, 2.5, 7.5, 5.5);
      else if (rm <= 3) recScore = lerp(rm, 2.5, 3, 5.5, 4);
      else if (rm <= 4) recScore = lerp(rm, 3, 4, 4, 2);
      else recScore = Math.max(0.5, lerp(rm, 4, 5, 2, 0.5));
    }
    let upsideScore = 5.0;
    if (upside != null) {
      if (upside >= 0.30) upsideScore = 9;
      else if (upside >= 0.15) upsideScore = lerp(upside, 0.15, 0.30, 7, 9);
      else if (upside >= 0) upsideScore = lerp(upside, 0, 0.15, 5, 7);
      else if (upside >= -0.15) upsideScore = lerp(upside, -0.15, 0, 2.5, 5);
      else upsideScore = 1.5;
    }
    analystScore = recScore * 0.65 + upsideScore * 0.35;
  }

  const rawScore = 0.20*histScore + 0.15*secScore + 0.20*moatScore + 0.15*trendScore + 0.15*healthScore + 0.15*analystScore;
  let alphaScore = parseFloat(Math.min(10, Math.max(0.1, rawScore)).toFixed(1));

  let isOvervalued = false;
  if (upside != null && upside < -0.05) isOvervalued = true;
  const avgMD = [deviation.pe, deviation.pfcf, deviation.evEbitda].filter(v=>v!=null);
  if (avgMD.length && avgMD.reduce((a,b)=>a+b,0)/avgMD.length > 0.15) isOvervalued = true;
  if (isOvervalued && alphaScore > 5.0) alphaScore = 5.0;

  let verdict;
  if (isOvervalued) verdict = alphaScore <= 2.5 ? 'STRONG SELL' : alphaScore <= 3.5 ? 'SELL' : 'HOLD';
  else if (alphaScore >= 7.5) verdict = 'STRONG BUY';
  else if (alphaScore >= 6.0) verdict = 'BUY';
  else if (alphaScore >= 4.0) verdict = 'HOLD';
  else if (alphaScore >= 2.5) verdict = 'SELL';
  else verdict = 'STRONG SELL';

  // --- Entry Price (mirrors thesis logic) ---
  const eps = current.pe && price ? price / current.pe : null;
  const fcfPS = current.pfcf && price ? price / current.pfcf : null;
  let ivPE = eps && eps > 0 && avg5y.pe ? avg5y.pe * eps : null;
  let ivPFCF = fcfPS && fcfPS > 0 && avg5y.pfcf ? avg5y.pfcf * fcfPS : null;
  let iv = ivPE && ivPFCF ? (ivPE + ivPFCF) / 2 : ivPE || ivPFCF;
  if (!iv && targetMean) iv = targetMean;
  else if (iv && targetMean) iv = iv * 0.6 + targetMean * 0.4;
  const mos = meta.moatRating === 'Wide' ? 0.15 : meta.moatRating === 'Narrow' ? 0.20 : 0.25;
  let entryPrice = null;
  if (iv && price) {
    entryPrice = Math.min(iv * (1 - mos), price * 0.97);
    if (isOvervalued || iv < price) {
      const disc = meta.moatRating === 'Wide' ? 0.10 : meta.moatRating === 'Narrow' ? 0.12 : 0.15;
      entryPrice = Math.min(entryPrice, price * (1 - disc));
    }
  }

  // 52w from summaryDetail
  const w52h = safe(apiData.ratiosTTM?.week52High) || null;
  const w52l = safe(apiData.ratiosTTM?.week52Low) || null;

  return {
    ticker, company_name: profile?.companyName || meta.name, sector: meta.sector,
    current_price: price, market_cap: profile?.marketCap,
    alpha_score: alphaScore, verdict, moat_rating: meta.moatRating,
    pe_ratio: current.pe, forward_pe: current.forwardPE,
    roic: current.roic != null ? parseFloat((current.roic * 100).toFixed(1)) : null,
    operating_margin: current.opMargin != null ? parseFloat((current.opMargin * 100).toFixed(1)) : null,
    revenue_growth: current.revGrowth,
    analyst_target: targetMean,
    upside_potential: upside != null ? parseFloat((upside * 100).toFixed(1)) : null,
    entry_price: entryPrice ? parseFloat(entryPrice.toFixed(2)) : null,
    week52_high: w52h, week52_low: w52l,
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

  await ensureCrumb();
  console.log('  Crumb OK\n');

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
      await sleep(2000);
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
