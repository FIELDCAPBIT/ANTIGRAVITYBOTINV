// AlphaFundamental v2.0 — Analysis Engine
import { calcAverage, calcDeviation } from './utils.js';
import { TICKERS_DATA, SECTOR_AVERAGES } from './tickers.js';

function safe(v) { return (v != null && isFinite(v) && !isNaN(v)) ? v : null; }

// Scoring weight constants — exposed for UI tooltip
export const SCORE_WEIGHTS = {
  histScore: { weight: 0.20, label: 'Val. Histórica' },
  secScore:  { weight: 0.15, label: 'Val. Sectorial' },
  moatScore: { weight: 0.20, label: 'Fortaleza MOAT' },
  trendScore:{ weight: 0.15, label: 'Calidad Tendencia' },
  healthScore:{ weight: 0.15, label: 'Salud Financiera' },
  analystScore:{ weight: 0.15, label: 'Sentimiento Analistas' }
};

export function runAnalysis(ticker, apiData) {
  const meta = TICKERS_DATA[ticker];
  if (!meta) return null;

  const { profile, quote, ratiosTTM, ratiosHist, metricsTTM, metricsHist,
    analystTargets, recTrend, earningsDate, dividendDate, exDividendDate,
    institutions, insiders, insiderActivity, technicals, spyReturn1y } = apiData;
  const sharesOutstanding = profile?.sharesOutstanding || null;

  const context = buildContext(meta, profile, quote);
  const historical = buildHistorical(ratiosTTM, ratiosHist, metricsTTM, metricsHist);
  const sector = buildSectorComparison(historical.current, meta.sector);
  const moat = buildMoat(meta, historical.current);
  const analyst = buildAnalyst(analystTargets, recTrend, earningsDate, dividendDate, exDividendDate, context.price);
  const insiderData = buildInsiderData(institutions, insiders, insiderActivity, sharesOutstanding);
  const techData = buildTechnicals(technicals, spyReturn1y, context.price);
  const scoring = buildScoring(historical, sector, moat, analyst, context.price, ratiosTTM);
  const thesis = buildThesis(meta, context, historical, sector, moat, scoring, analyst, ratiosTTM, metricsTTM);

  return { context, historical, sector, moat, analyst, insiderData, techData, scoring, thesis, meta };
}

// --- Section 1: Business Context (Spanish) ---
function buildContext(meta, profile, quote) {
  const price = quote?.price ?? profile?.price ?? null;
  const mktCap = profile?.marketCap ?? null;
  const fmtCap = mktCap ? (mktCap >= 1e12 ? (mktCap/1e12).toFixed(1)+'T' : mktCap >= 1e9 ? (mktCap/1e9).toFixed(0)+'B' : (mktCap/1e6).toFixed(0)+'M') : '';
  const empStr = profile?.fullTimeEmployees ? profile.fullTimeEmployees.toLocaleString() : null;
  const country = profile?.country || '';
  const sector = profile?.sector || meta.sector;
  const industry = profile?.industry || meta.industry;
  const moatLabel = meta.moatRating === 'Wide' ? 'amplio' : meta.moatRating === 'Narrow' ? 'estrecho' : 'sin moat significativo';
  const moatSrc = meta.moatSources?.length > 0 ? meta.moatSources.join(', ') : '';

  let narrative = `${meta.name} es una compañía del sector ${sector} (${industry})`;
  if (country) narrative += ` con sede en ${country}`;
  if (empStr) narrative += ` y aproximadamente ${empStr} empleados`;
  narrative += `. Con una capitalización bursátil de $${fmtCap}, `;
  if (meta.moatRating === 'Wide') narrative += `posee un moat económico ${moatLabel} basado en ${moatSrc}, lo que le confiere una posición competitiva dominante en su mercado.`;
  else if (meta.moatRating === 'Narrow') narrative += `cuenta con un moat ${moatLabel} sustentado por ${moatSrc}, ofreciendo una ventaja competitiva moderada.`;
  else narrative += `opera en un entorno altamente competitivo ${moatSrc ? 'con ' + moatSrc : 'sin ventajas competitivas claras'}.`;
  if (profile?.beta) narrative += ` Su beta de ${profile.beta.toFixed(2)} indica una volatilidad ${profile.beta > 1.2 ? 'superior' : profile.beta < 0.8 ? 'inferior' : 'similar'} al mercado.`;
  if (profile?.dividendYield && profile.dividendYield > 0) narrative += ` Ofrece una rentabilidad por dividendo del ${(profile.dividendYield * 100).toFixed(2)}%.`;

  return {
    price, mktCap, description: narrative,
    beta: profile?.beta,
    dividendYield: profile?.dividendYield || (profile?.lastDividend && price ? profile.lastDividend / price : null),
    companyName: profile?.companyName || quote?.name || meta.name,
    sector, industry,
    employees: profile?.fullTimeEmployees, country
  };
}

// --- Section 2: Historical & Sector Valuation ---
function buildHistorical(ratiosTTM, ratiosHist, metricsTTM, metricsHist) {
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

  const deviation = {
    pe: calcDeviation(current.pe, avg5y.pe), pfcf: calcDeviation(current.pfcf, avg5y.pfcf),
    forwardPE: calcDeviation(current.forwardPE, avg5y.forwardPE),
    evEbitda: calcDeviation(current.evEbitda, avg5y.evEbitda),
    peg: calcDeviation(current.peg, avg5y.peg),
    roic: calcDeviation(current.roic, avg5y.roic), opMargin: calcDeviation(current.opMargin, avg5y.opMargin),
    netDebtEbitda: calcDeviation(current.netDebtEbitda, avg5y.netDebtEbitda),
    revGrowth: calcDeviation(current.revGrowth, avg5y.revGrowth)
  };

  return { current, avg5y, deviation };
}

function buildSectorComparison(current, sectorName) {
  const sa = SECTOR_AVERAGES[sectorName] || SECTOR_AVERAGES["Technology"];
  return {
    sectorAvg: sa,
    deviation: {
      pe: calcDeviation(current.pe, sa.pe),
      forwardPE: calcDeviation(current.forwardPE, sa.forwardPE),
      pfcf: calcDeviation(current.pfcf, sa.pfcf),
      evEbitda: calcDeviation(current.evEbitda, sa.evEbitda),
      peg: calcDeviation(current.peg, sa.peg),
      roic: calcDeviation(current.roic, sa.roic),
      opMargin: calcDeviation(current.opMargin, sa.opMargin),
      revGrowth: calcDeviation(current.revGrowth, sa.revGrowth),
      netDebtEbitda: calcDeviation(current.netDebtEbitda, sa.netDebtEbitda)
    }
  };
}

// --- Section 3: Analyst Consensus ---
function buildAnalyst(targets, recTrend, earningsDate, dividendDate, exDividendDate, price) {
  if (!targets) return { available: false };
  const current = recTrend?.[0] || {};
  const totalRatings = (current.strongBuy || 0) + (current.buy || 0) + (current.hold || 0) + (current.sell || 0) + (current.strongSell || 0);
  let upside = null;
  if (targets.targetMeanPrice && price) upside = (targets.targetMeanPrice - price) / price;
  return {
    available: !!(targets.targetMeanPrice),
    targetMean: targets.targetMeanPrice, targetHigh: targets.targetHighPrice,
    targetLow: targets.targetLowPrice, targetMedian: targets.targetMedianPrice,
    numberOfAnalysts: targets.numberOfAnalysts,
    recommendationMean: targets.recommendationMean, recommendationKey: targets.recommendationKey,
    recTrend: recTrend || [],
    strongBuy: current.strongBuy || 0, buy: current.buy || 0, hold: current.hold || 0,
    sell: current.sell || 0, strongSell: current.strongSell || 0, totalRatings,
    buyCount: (current.strongBuy || 0) + (current.buy || 0), upside,
    earningsDate, dividendDate, exDividendDate
  };
}

// --- Section 4: Insider & Institutional ---
// ERROR 6 FIX: Insider signal with significance threshold
// Only flag "Bajista" if net selling exceeds 0.01% of shares outstanding
function buildInsiderData(institutions, insiders, insiderActivity, sharesOutstanding) {
  let signal = 'Neutral';
  let significancePct = null;
  if (insiderActivity) {
    const net = insiderActivity.netShares || 0;
    if (sharesOutstanding && sharesOutstanding > 0) {
      significancePct = Math.abs(net) / sharesOutstanding * 100;
      if (net > 0 && significancePct >= 0.01) signal = 'Alcista';
      else if (net < 0 && significancePct >= 0.01) signal = 'Bajista';
      else signal = 'Neutral / Sin señal relevante';
    } else {
      if (net > 0) signal = 'Alcista';
      else if (net < 0) signal = 'Bajista';
    }
  }
  return { institutions: (institutions || []).slice(0, 5), insiders: (insiders || []).slice(0, 8), activity: insiderActivity || {}, signal, significancePct };
}

// --- Section 6 (new): Technicals ---
function buildTechnicals(tech, spyReturn1y, price) {
  if (!tech) return null;
  let trend = 'Neutral';
  if (price && tech.sma200d) {
    if (price > tech.sma200d * 1.05) trend = 'Alcista';
    else if (price < tech.sma200d * 0.95) trend = 'Bajista';
  }
  let rsiBand = 'Neutral';
  if (tech.rsi != null) {
    if (tech.rsi > 70) rsiBand = 'Sobrecompra';
    else if (tech.rsi < 30) rsiBand = 'Sobreventa';
  }
  return { ...tech, trend, rsiBand, spyReturn1y };
}

// Moat source explanations map
const MOAT_SOURCE_DESC = {
  'Network Effects': 'efectos de red que hacen que el producto sea más valioso a medida que más usuarios lo adoptan, creando un ciclo virtuoso difícil de romper',
  'Switching Costs': 'altos costes de cambio para los clientes, que están profundamente integrados en el ecosistema del producto y migrar supondría un coste significativo en tiempo, dinero y riesgo operativo',
  'Intangible Assets': 'activos intangibles como marcas reconocidas globalmente, patentes clave y licencias regulatorias que otorgan ventajas exclusivas no replicables',
  'Cost Advantages': 'ventajas de coste estructurales derivadas de economías de escala, procesos propietarios o acceso preferencial a recursos que permiten operar con márgenes superiores',
  'Efficient Scale': 'escala eficiente en un mercado de tamaño limitado donde la entrada de un nuevo competidor destruiría la rentabilidad para todos, disuadiendo la competencia'
};

// --- Section 5: Moat ---
function buildMoat(meta, cur) {
  let s = meta.moatRating === 'Wide' ? 8 : meta.moatRating === 'Narrow' ? 5 : 2;
  if (cur.roic != null) {
    if (cur.roic > 0.25) s = Math.min(10, s + 2);
    else if (cur.roic > 0.15) s = Math.min(10, s + 1);
    else if (cur.roic < 0.08) s = Math.max(1, s - 2);
  }
  let expanding = 'Estable';
  if (cur.roic != null && cur.roic > 0.20 && meta.moatRating === 'Wide') expanding = 'En expansión';
  if (meta.moatRating === 'None') expanding = 'Inexistente';
  let durability = '10+ años';
  if (meta.moatRating === 'Wide') durability = '15-20+ años';
  else if (meta.moatRating === 'Narrow') durability = '5-10 años';
  else durability = '< 5 años';

  // Build rich moat explanation
  const sourceDescs = meta.moatSources.map(src => MOAT_SOURCE_DESC[src] || src.toLowerCase()).join('; y ');
  let moatExplanation = '';
  if (meta.moatRating === 'Wide') {
    moatExplanation = `${meta.name} posee un moat económico amplio sustentado por ${sourceDescs}. Con un ROIC del ${cur.roic != null ? (cur.roic * 100).toFixed(1) + '%' : 'N/A'} y márgenes operativos del ${cur.opMargin != null ? (cur.opMargin * 100).toFixed(1) + '%' : 'N/A'}, la compañía demuestra que estas ventajas se traducen en retornos superiores al coste de capital de forma consistente. Estas barreras estructurales son extremadamente difíciles de replicar y proporcionan protección duradera contra la competencia.`;
  } else if (meta.moatRating === 'Narrow') {
    moatExplanation = `${meta.name} tiene un moat estrecho basado en ${sourceDescs}. Aunque estas ventajas generan retornos superiores a la media (ROIC: ${cur.roic != null ? (cur.roic * 100).toFixed(1) + '%' : 'N/A'}), su durabilidad es incierta. La competencia tecnológica o cambios regulatorios podrían erosionar estas ventajas en un horizonte de 5-10 años si la dirección no invierte activamente en reforzarlas.`;
  } else {
    moatExplanation = `${meta.name} carece de un moat económico significativo. Sin ventajas competitivas duraderas, la empresa está expuesta a presiones competitivas intensas que limitan su capacidad de generar retornos superiores al coste de capital de forma sostenida.`;
  }
  return { rating: meta.moatRating, sources: meta.moatSources, risks: meta.risks, strength: s, expanding, durability, moatExplanation };
}

// --- Section 7: Enhanced Decimal Scoring Engine ---
// Continuous interpolation for maximum granularity (0.0–10.0)
function buildScoring(hist, sec, moat, analyst, price, ratiosTTM) {

  // Linear interpolation: maps a value in [inLow,inHigh] → [outLow,outHigh], clamped
  const lerp = (val, inLow, inHigh, outLow, outHigh) => {
    if (val <= inLow) return outLow;
    if (val >= inHigh) return outHigh;
    return outLow + (val - inLow) / (inHigh - inLow) * (outHigh - outLow);
  };

  // Score a valuation deviation (lower = better for PE/PFcf/EvEbitda)
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

  // Score a quality deviation (higher = better for ROIC/margin)
  const scoreQualDev = (dev) => {
    if (dev == null) return null;
    if (dev >= 0.30)  return 10.0;
    if (dev >= 0.10)  return lerp(dev, 0.10, 0.30, 7.5, 10.0);
    if (dev >= 0)     return lerp(dev, 0, 0.10, 5.0, 7.5);
    if (dev >= -0.10) return lerp(dev, -0.10, 0, 3.0, 5.0);
    if (dev >= -0.25) return lerp(dev, -0.25, -0.10, 1.0, 3.0);
    return 0.5;
  };

  const avgValid = (arr) => {
    const v = arr.filter(s => s != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 5.0;
  };

  // --- Sub-score 1: Historical Valuation (5 metrics) ---
  const histScore = avgValid([
    scoreValDev(hist.deviation.pe), scoreValDev(hist.deviation.pfcf),
    scoreValDev(hist.deviation.evEbitda), scoreValDev(hist.deviation.forwardPE),
    scoreValDev(hist.deviation.peg)
  ]);

  // --- Sub-score 2: Sector Comparison (3 metrics) ---
  const secScore = avgValid([
    scoreValDev(sec.deviation.pe), scoreValDev(sec.deviation.pfcf),
    scoreValDev(sec.deviation.evEbitda)
  ]);

  // --- Sub-score 3: Moat (continuous based on rating + ROIC + margin) ---
  let moatBase = moat.rating === 'Wide' ? 8.0 : moat.rating === 'Narrow' ? 5.0 : 2.0;
  if (hist.current.roic != null) {
    if (hist.current.roic > 0.30) moatBase += 1.5;
    else if (hist.current.roic > 0.20) moatBase += lerp(hist.current.roic, 0.20, 0.30, 0.5, 1.5);
    else if (hist.current.roic > 0.12) moatBase += lerp(hist.current.roic, 0.12, 0.20, 0, 0.5);
    else if (hist.current.roic < 0.08) moatBase -= lerp(hist.current.roic, 0.02, 0.08, 2.0, 0.5);
  }
  if (hist.current.opMargin != null && hist.current.opMargin > 0.25) moatBase += 0.5;
  const moatScore = Math.min(10.0, Math.max(0.0, moatBase));

  // --- Sub-score 4: Quality Trend (ROIC + opMargin + revGrowth vs history) ---
  const trendScore = avgValid([
    scoreQualDev(hist.deviation.roic), scoreQualDev(hist.deviation.opMargin),
    scoreQualDev(hist.deviation.revGrowth)
  ]);

  // --- Sub-score 5: Financial Health (Net Debt/EBITDA continuous) ---
  let healthScore = 5.0;
  const nde = hist.current.netDebtEbitda;
  if (nde != null) {
    if (nde < 0) healthScore = 10.0;
    else if (nde <= 1.0) healthScore = lerp(nde, 0, 1.0, 10.0, 8.0);
    else if (nde <= 2.0) healthScore = lerp(nde, 1.0, 2.0, 8.0, 6.5);
    else if (nde <= 3.0) healthScore = lerp(nde, 2.0, 3.0, 6.5, 4.5);
    else if (nde <= 5.0) healthScore = lerp(nde, 3.0, 5.0, 4.5, 2.0);
    else healthScore = Math.max(0.5, lerp(nde, 5.0, 8.0, 2.0, 0.5));
  }

  // --- Sub-score 6: Analyst Consensus (recommendation + upside blend) ---
  let analystScore = 5.0;
  if (analyst.available) {
    let recScore = 5.0;
    const rm = analyst.recommendationMean;
    if (rm != null) {
      if (rm <= 1.0) recScore = 10.0;
      else if (rm <= 2.0) recScore = lerp(rm, 1.0, 2.0, 10.0, 7.5);
      else if (rm <= 2.5) recScore = lerp(rm, 2.0, 2.5, 7.5, 5.5);
      else if (rm <= 3.0) recScore = lerp(rm, 2.5, 3.0, 5.5, 4.0);
      else if (rm <= 4.0) recScore = lerp(rm, 3.0, 4.0, 4.0, 2.0);
      else recScore = Math.max(0.5, lerp(rm, 4.0, 5.0, 2.0, 0.5));
    }
    let upsideScore = 5.0;
    if (analyst.upside != null) {
      if (analyst.upside >= 0.30) upsideScore = 9.0;
      else if (analyst.upside >= 0.15) upsideScore = lerp(analyst.upside, 0.15, 0.30, 7.0, 9.0);
      else if (analyst.upside >= 0) upsideScore = lerp(analyst.upside, 0, 0.15, 5.0, 7.0);
      else if (analyst.upside >= -0.15) upsideScore = lerp(analyst.upside, -0.15, 0, 2.5, 5.0);
      else upsideScore = 1.5;
    }
    analystScore = recScore * 0.65 + upsideScore * 0.35;
  }

  // --- Weighted Final Score (weights documented in SCORE_WEIGHTS) ---
  // 20% Historical Valuation + 15% Sector + 20% MOAT + 15% Trend + 15% Health + 15% Analyst = 100%
  const W = SCORE_WEIGHTS;
  const rawScore = W.histScore.weight * histScore + W.secScore.weight * secScore + W.moatScore.weight * moatScore
                 + W.trendScore.weight * trendScore + W.healthScore.weight * healthScore + W.analystScore.weight * analystScore;
  let alphaScore = parseFloat(Math.min(10.0, Math.max(0.1, rawScore)).toFixed(1));

  // --- Overvalued Cap ---
  let isOvervalued = false;
  if (analyst.upside != null && analyst.upside < -0.05) isOvervalued = true;
  const avgMD = calcAverageDev([hist.deviation.pe, hist.deviation.pfcf, hist.deviation.evEbitda]);
  if (avgMD != null && avgMD > 0.15) isOvervalued = true;
  if (isOvervalued && alphaScore > 5.0) alphaScore = 5.0;

  // --- Verdict (decimal thresholds) ---
  let verdict;
  if (isOvervalued) verdict = alphaScore <= 2.5 ? 'STRONG SELL' : alphaScore <= 3.5 ? 'SELL' : 'HOLD';
  else if (alphaScore >= 7.5) verdict = 'STRONG BUY';
  else if (alphaScore >= 6.0) verdict = 'BUY';
  else if (alphaScore >= 4.0) verdict = 'HOLD';
  else if (alphaScore >= 2.5) verdict = 'SELL';
  else verdict = 'STRONG SELL';

  return {
    alphaScore, verdict, isOvervalued,
    histScore: parseFloat(histScore.toFixed(1)),
    secScore: parseFloat(secScore.toFixed(1)),
    moatScore: parseFloat(moatScore.toFixed(1)),
    trendScore: parseFloat(trendScore.toFixed(1)),
    healthScore: parseFloat(healthScore.toFixed(1)),
    analystScore: parseFloat(analystScore.toFixed(1))
  };
}

function calcAverageDev(devs) {
  const valid = devs.filter(v => v != null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// --- Section 8: Thesis & Entry Price (Spanish) ---
// ERROR 1 FIX: Intrinsic value = simple arithmetic mean of available methods (P/E, P/FCF, Consensus)
// ERROR 2 FIX: Entry price = intrinsic_value × (1 - margin_of_safety), clearly documented
function buildThesis(meta, ctx, hist, sec, moat, scoring, analyst, ratiosTTM, metricsTTM) {
  const price = ctx.price;
  let ivPE = null, ivPFCF = null, ivConsensus = null;
  const pe = safe(ratiosTTM?.priceToEarningsRatioTTM);
  const eps = pe && price ? price / pe : null;
  if (eps && eps > 0 && hist.avg5y.pe && hist.avg5y.pe > 0) ivPE = hist.avg5y.pe * eps;
  const fcfPS = safe(ratiosTTM?.freeCashFlowPerShareTTM);
  if (fcfPS && fcfPS > 0 && hist.avg5y.pfcf && hist.avg5y.pfcf > 0) ivPFCF = hist.avg5y.pfcf * fcfPS;
  if (analyst.targetMean && analyst.targetMean > 0) ivConsensus = analyst.targetMean;

  // Simple arithmetic mean of all available methods
  const ivMethods = [ivPE, ivPFCF, ivConsensus].filter(v => v != null && v > 0);
  let iv = ivMethods.length > 0 ? ivMethods.reduce((a, b) => a + b, 0) / ivMethods.length : null;
  const ivMethodCount = ivMethods.length;

  // Margin of safety based on moat strength
  const mos = moat.rating === 'Wide' ? 0.15 : moat.rating === 'Narrow' ? 0.20 : 0.25;

  // Entry price: intrinsic_value × (1 - margin_of_safety)
  // Rule: entry must ALWAYS be below current price
  let entry = null;
  if (iv && price) {
    entry = iv * (1 - mos);
    // Ensure entry is always below current price
    entry = Math.min(entry, price * 0.97);
    if (scoring.isOvervalued || iv < price) {
      const disc = moat.rating === 'Wide' ? 0.10 : moat.rating === 'Narrow' ? 0.12 : 0.15;
      entry = Math.min(entry, price * (1 - disc));
    }
  }

  const v = scoring.verdict;
  const roicPct = hist.current.roic != null ? (hist.current.roic * 100).toFixed(1) : 'N/A';
  const opMPct = hist.current.opMargin != null ? (hist.current.opMargin * 100).toFixed(1) : 'N/A';
  const moatSrc = moat.sources.length > 0 ? moat.sources.join(', ') : 'ventajas competitivas limitadas';
  const pePct = hist.deviation.pe != null ? (hist.deviation.pe * 100).toFixed(0) : null;

  let p1 = '';
  if (v === 'STRONG BUY' || v === 'BUY') {
    p1 = `${meta.name} presenta una oportunidad de valor convincente para inversores a largo plazo. Cotiza con descuento respecto a sus propios múltiplos históricos de 5 años, con un P/E trailing de ${hist.current.pe ? hist.current.pe.toFixed(1) + 'x' : 'N/A'} frente a una media de ${hist.avg5y.pe ? hist.avg5y.pe.toFixed(1) + 'x' : 'N/A'}. El ROIC de ${roicPct}% supera significativamente su coste de capital, indicando creación real de valor económico. Con márgenes operativos del ${opMPct}%, el negocio demuestra poder de fijación de precios y eficiencia operativa que el mercado puede estar infravalorando.`;
  } else if (v === 'HOLD') {
    p1 = `${meta.name} cotiza a niveles ampliamente consistentes con su valor fundamental. La valoración actual refleja una visión equilibrada de las perspectivas de crecimiento y perfil de riesgo. Con un P/E trailing de ${hist.current.pe ? hist.current.pe.toFixed(1) + 'x' : 'N/A'}, la acción no está materialmente barata ni cara respecto a su propio histórico. El ROIC de ${roicPct}% y margen operativo de ${opMPct}% indican calidad sólida pero ya reflejada en precio.`;
  } else {
    p1 = `${meta.name} parece sobrevalorada a niveles actuales. Cotiza a múltiplos elevados respecto a su propio histórico y peers del sector, con un P/E trailing de ${hist.current.pe ? hist.current.pe.toFixed(1) + 'x' : 'N/A'} frente a una media 5Y de ${hist.avg5y.pe ? hist.avg5y.pe.toFixed(1) + 'x' : 'N/A'}. Aunque la calidad del negocio sigue siendo fuerte con ROIC al ${roicPct}% y márgenes del ${opMPct}%, la prima actual deja un margen de seguridad mínimo.`;
  }

  let p2 = `La posición competitiva se sustenta en su moat ${moat.rating === 'Wide' ? 'amplio' : moat.rating === 'Narrow' ? 'estrecho' : 'inexistente'}, impulsado por ${moatSrc}. `;
  if (moat.rating === 'Wide') p2 += `Este moat está ${moat.expanding === 'En expansión' ? 'ampliándose activamente' : 'estable y duradero'}, proporcionando un runway de décadas para la capitalización compuesta. Las ventajas estructurales son difíciles de replicar y crean altas barreras de entrada.`;
  else if (moat.rating === 'Narrow') p2 += `Este moat proporciona una ventaja competitiva pero podría erosionarse con el tiempo ante la disrupción tecnológica y competidores agresivos.`;
  else p2 += `La ausencia de ventajas competitivas duraderas expone a la empresa a presiones competitivas intensas.`;

  let p3 = '';
  if (pePct !== null) p3 = `Desde la perspectiva de valoración, la acción cotiza con un ${Math.abs(parseInt(pePct))}% de ${parseInt(pePct) < 0 ? 'descuento' : 'prima'} respecto a su P/E medio de 5 años. `;
  else p3 = 'Los datos de valoración sugieren que la acción está en línea con las normas históricas. ';
  if (analyst.available && analyst.upside != null) p3 += `El consenso de analistas de $${analyst.targetMean?.toFixed(2)} implica un ${analyst.upside >= 0 ? '+' : ''}${(analyst.upside * 100).toFixed(0)}% desde niveles actuales (${analyst.numberOfAnalysts} analistas). `;
  if (iv) p3 += `Nuestro valor intrínseco (media aritmética de ${ivMethodCount} método${ivMethodCount > 1 ? 's' : ''}) es $${iv.toFixed(2)}, lo que sugiere que la acción cotiza ${iv > price ? 'por debajo' : 'por encima'} de su valor justo.`;

  let p4 = `Los riesgos clave incluyen ${moat.risks[0]?.toLowerCase() || 'presiones competitivas'} y ${moat.risks[1]?.toLowerCase() || 'ciclicidad del mercado'}. `;
  if (entry && iv && price) {
    const ds = ((entry - price) / price * 100).toFixed(0);
    const us = iv > price ? ((iv - price) / price * 100).toFixed(0) : '0';
    p4 += `En un escenario bajista, la acción podría retroceder hasta nuestro nivel de entrada de $${entry.toFixed(2)} (${ds}% desde actual). `;
    if (parseFloat(us) > 0) p4 += `En el caso base, la convergencia al valor intrínseco de $${iv.toFixed(2)} ofrece un +${us}% de upside. `;
    p4 += scoring.alphaScore >= 6
      ? `Recomendamos acumular por debajo de $${entry.toFixed(2)} con un ${(mos * 100).toFixed(0)}% de margen de seguridad.`
      : `Recomendamos esperar un punto de entrada más atractivo antes de comprometer nuevo capital.`;
  }

  const thesisText = [p1, p2, p3, p4].join('\n\n');
  let just = '';
  if (iv && entry && price) {
    just = `Valor intrínseco: $${iv.toFixed(2)} (media aritmética: `;
    const parts = [];
    if (ivPE) parts.push(`P/E → $${ivPE.toFixed(2)}`);
    if (ivPFCF) parts.push(`P/FCF → $${ivPFCF.toFixed(2)}`);
    if (ivConsensus) parts.push(`Consenso → $${ivConsensus.toFixed(2)}`);
    just += parts.join(', ');
    just += `). ${(mos * 100).toFixed(0)}% margen de seguridad (${moat.rating} moat) → entrada $${entry.toFixed(2)}. `;
    just += `Precio actual $${price.toFixed(2)} está ${price > iv ? ((price - iv) / iv * 100).toFixed(1) + '% por encima' : ((iv - price) / iv * 100).toFixed(1) + '% por debajo'} del valor intrínseco.`;
  } else { just = 'Datos insuficientes para calcular un valor intrínseco fiable.'; }

  return { intrinsicValue: iv, marginOfSafety: mos, entryPrice: entry, thesisText, priceJustification: just, ivPE, ivPFCF, ivConsensus, ivMethodCount };
}
