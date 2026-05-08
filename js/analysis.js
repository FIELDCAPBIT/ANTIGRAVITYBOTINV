// AlphaFundamental v2.0 — Analysis Engine
import { calcAverage, calcDeviation } from './utils.js';
import { TICKERS_DATA, SECTOR_AVERAGES } from './tickers.js';

function safe(v) { return (v != null && isFinite(v) && !isNaN(v)) ? v : null; }

// v3.0 Scoring weights — 1.1 Dynamic Weight System
export const SCORE_WEIGHTS = {
  bizQuality: { weight: 0.30, label: 'Calidad Negocio' },
  moatScore:  { weight: 0.25, label: 'Fortaleza MOAT' },
  valuation:  { weight: 0.20, label: 'Valoración' },
  healthScore:{ weight: 0.15, label: 'Salud Financiera' },
  momentum:   { weight: 0.10, label: 'Momentum Fundamental' }
};

export function runAnalysis(ticker, apiData) {
  const meta = TICKERS_DATA[ticker];
  if (!meta) return null;

  const { profile, quote, ratiosTTM, ratiosHist, metricsTTM, metricsHist,
    analystTargets, recTrend, earningsDate, dividendDate, exDividendDate,
    institutions, insiders, insiderActivity, technicals, spyReturn1y,
    earningsQuality: eqRaw, earningsRevisions: erRaw } = apiData;
  const sharesOutstanding = profile?.sharesOutstanding || null;

  const context = buildContext(meta, profile, quote);
  const historical = buildHistorical(ratiosTTM, ratiosHist, metricsTTM, metricsHist);
  const sector = buildSectorComparison(historical.current, meta.sector);
  const moat = buildMoat(meta, historical.current);
  const analyst = buildAnalyst(analystTargets, recTrend, earningsDate, dividendDate, exDividendDate, context.price);
  const insiderData = buildInsiderData(institutions, insiders, insiderActivity, sharesOutstanding);
  const techData = buildTechnicals(technicals, spyReturn1y, context.price);

  // v3.0 new modules
  const earningsQual = buildEarningsQuality(eqRaw, metricsTTM);
  const lifecycle = buildBusinessLifecycle(historical, ratiosTTM);
  const meanReversion = buildMeanReversion(historical, sector);
  const earningsRevisions = buildEarningsRevisions(erRaw);
  const dcf = buildDCF(ratiosTTM, metricsTTM, historical, analyst, context.price, sharesOutstanding, moat, profile);

  const scoring = buildScoring(historical, sector, moat, analyst, context.price, ratiosTTM, earningsQual, earningsRevisions, dcf);
  const positionSizing = buildPositionSizing(scoring, analyst, moat, context.price, dcf);
  const thesis = buildThesis(meta, context, historical, sector, moat, scoring, analyst, ratiosTTM, metricsTTM, dcf, techData, positionSizing);

  return { context, historical, sector, moat, analyst, insiderData, techData, scoring, thesis, meta,
    earningsQual, lifecycle, meanReversion, earningsRevisions, dcf, positionSizing };
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

// --- 1.3: Earnings Quality Score ---
function buildEarningsQuality(eqRaw, metricsTTM) {
  const ccr = eqRaw?.cashConversion ?? null;
  const accruals = eqRaw?.accrualsRatio ?? null;
  let grade = 'media', emoji = '🟡', score = 5;
  if (ccr != null) {
    if (ccr > 0.85 && (accruals == null || accruals < 0.05)) { grade = 'alta'; emoji = '🟢'; score = 9; }
    else if (ccr >= 0.60) { grade = 'media'; emoji = '🟡'; score = 6; }
    else { grade = 'baja'; emoji = '🔴'; score = 3; }
  }
  return { cashConversion: ccr, accrualsRatio: accruals, grade, emoji, score,
    netIncome: eqRaw?.netIncome, operatingCF: eqRaw?.operatingCashFlow, fcf: eqRaw?.freeCashFlow, totalAssets: eqRaw?.totalAssets };
}

// --- 2.3: Business Lifecycle ---
function buildBusinessLifecycle(hist, ratiosTTM) {
  const rg = hist.current.revGrowth;
  const roic = hist.current.roic;
  const om = hist.current.opMargin;
  let phase = 3, label = 'Madurez', emoji = '📊', desc = '';
  if (rg != null && roic != null) {
    if (roic < 0.08 && (rg == null || rg > 0.15)) { phase = 1; label = 'Emergente'; emoji = '🌱'; desc = 'Empresa en fase de inversión agresiva. ROIC aún bajo, prioridad en capturar mercado. No aplicar ratios de empresa madura.'; }
    else if (rg > 0.15) { phase = 2; label = 'Crecimiento'; emoji = '🚀'; desc = 'Crecimiento acelerado con márgenes en expansión. Un P/E elevado puede estar justificado por la trayectoria de crecimiento.'; }
    else if (rg > 0 && roic > 0.10) { phase = 3; label = 'Madurez'; emoji = '📊'; desc = 'Negocio maduro con retornos estables. Buscar buybacks, dividendos y eficiencia operativa como señales de disciplina de capital.'; }
    else { phase = 4; label = 'Declive'; emoji = '📉'; desc = 'Crecimiento estancado o negativo con márgenes bajo presión. Alta cautela: verificar si es cíclico o estructural.'; }
  } else if (rg != null && rg > 0.20) { phase = 2; label = 'Crecimiento'; emoji = '🚀'; desc = 'Alto crecimiento de ingresos. Evaluar sostenibilidad.'; }
  else { desc = 'Negocio con métricas estables típicas de fase madura.'; }
  return { phase, label, emoji, desc };
}

// --- 2.4: Mean Reversion Score ---
function buildMeanReversion(hist, sec) {
  const devs = [hist.deviation.pe, hist.deviation.pfcf, hist.deviation.evEbitda].filter(d => d != null);
  if (!devs.length) return { score: null, label: 'Sin datos', desc: 'Datos insuficientes para calcular reversión a la media.' };
  const avgDev = devs.reduce((a, b) => a + b, 0) / devs.length;
  // High positive deviation = high reversion probability (overvalued tends to revert down)
  // High negative deviation = low reversion probability short term (undervalued)
  let score, label;
  if (avgDev > 0.20) { score = 9; label = 'Muy alta'; }
  else if (avgDev > 0.10) { score = 7; label = 'Alta'; }
  else if (avgDev > -0.05) { score = 5; label = 'Moderada'; }
  else if (avgDev > -0.15) { score = 3; label = 'Baja'; }
  else { score = 1; label = 'Muy baja'; }
  const dir = avgDev > 0.05 ? 'a la baja (sobrevaluado)' : avgDev < -0.05 ? 'al alza (infravaluado)' : 'neutral';
  return { score, label, avgDev,
    desc: `Probabilidad de reversión ${label.toLowerCase()} ${dir}. Los múltiplos actuales se desvían un ${Math.abs(avgDev * 100).toFixed(0)}% de la media histórica. Históricamente, desviaciones >15% tienden a revertir en 12-24 meses.` };
}

// --- 3.4: Earnings Revision Momentum ---
function buildEarningsRevisions(erRaw) {
  if (!erRaw) return { available: false, score: 5, signal: 'Sin datos' };
  const cy = erRaw.currentYear || {};
  const ny = erRaw.nextYear || {};
  // Calculate revision % changes
  const epsRev30d = (cy.epsEst && cy.epsPrior30d && cy.epsPrior30d !== 0) ? (cy.epsEst - cy.epsPrior30d) / Math.abs(cy.epsPrior30d) : null;
  const epsRev90d = (cy.epsEst && cy.epsPrior90d && cy.epsPrior90d !== 0) ? (cy.epsEst - cy.epsPrior90d) / Math.abs(cy.epsPrior90d) : null;
  const revRev30d = (cy.revEst && cy.revPrior30d && cy.revPrior30d !== 0) ? (cy.revEst - cy.revPrior30d) / Math.abs(cy.revPrior30d) : null;
  const ratio = (cy.numUp + cy.numDown > 0) ? cy.numUp / (cy.numUp + cy.numDown) : null;
  // Score
  let score = 5;
  const factors = [];
  if (epsRev30d != null) { if (epsRev30d > 0.02) { score += 1.5; factors.push('EPS ↑'); } else if (epsRev30d < -0.02) { score -= 1.5; factors.push('EPS ↓'); } }
  if (epsRev90d != null) { if (epsRev90d > 0.05) { score += 1; factors.push('EPS 90d ↑'); } else if (epsRev90d < -0.05) { score -= 1; factors.push('EPS 90d ↓'); } }
  if (ratio != null) { if (ratio > 0.7) { score += 1.5; factors.push('Ratio ↑'); } else if (ratio < 0.3) { score -= 1.5; factors.push('Ratio ↓'); } }
  score = Math.min(10, Math.max(0, score));
  const signal = score >= 7 ? 'Positivo' : score <= 3 ? 'Negativo' : 'Neutral';
  return { available: true, score: parseFloat(score.toFixed(1)), signal, epsRev30d, epsRev90d, revRev30d, ratio,
    currentYear: cy, nextYear: ny, factors };
}

// --- 1.2: DCF with Scenarios ---
function buildDCF(ratiosTTM, metricsTTM, hist, analyst, price, shares, moat, profile) {
  const fcf = metricsTTM?.freeCashFlowPerShareTTM ? metricsTTM.freeCashFlowPerShareTTM * shares : null;
  if (!fcf || fcf <= 0 || !shares || !price) return { available: false };
  const fcfPS = fcf / shares;
  const beta = profile?.beta || 1.0;
  const wacc = 0.045 + beta * 0.055; // risk-free 4.5% + beta * equity premium 5.5%
  const termGrowth = 0.025;
  const rg = hist.current.revGrowth ?? 0.08;

  const scenario = (growthRate, marginAdj, label) => {
    let cumFCF = 0;
    let projFCF = fcfPS;
    for (let y = 1; y <= 5; y++) {
      projFCF *= (1 + growthRate) * (1 + marginAdj / 5);
      cumFCF += projFCF / Math.pow(1 + wacc, y);
    }
    const termValue = projFCF * (1 + termGrowth) / (wacc - termGrowth);
    const pvTerm = termValue / Math.pow(1 + wacc, 5);
    return { label, value: parseFloat((cumFCF + pvTerm).toFixed(2)), growthRate, marginAdj };
  };

  const bear = scenario(Math.max(0, rg * 0.5), -0.03, 'Bajista');
  const base = scenario(rg, 0, 'Base');
  const bull = scenario(rg * 1.3, 0.02, 'Alcista');

  let probBase = 0.50, probBear = 0.25, probBull = 0.25;
  if (moat.rating === 'Wide') { probBase += 0.05; probBear -= 0.05; }
  else if (moat.rating === 'None') { probBear += 0.10; probBase -= 0.05; probBull -= 0.05; }
  
  const revGrowthDiff = (hist.current.revGrowth ?? 0) - (hist.avg5y.revGrowth ?? 0);
  if (revGrowthDiff > 0.05) { probBull += 0.05; probBear -= 0.05; }
  else if (revGrowthDiff < -0.05) { probBear += 0.05; probBull -= 0.05; }

  const opMarginDiff = (hist.current.opMargin ?? 0) - (hist.avg5y.opMargin ?? 0);
  if (opMarginDiff > 0.02) { probBull += 0.05; probBear -= 0.05; }
  else if (opMarginDiff < -0.02) { probBear += 0.05; probBull -= 0.05; }

  const totalProb = probBase + probBear + probBull;
  probBase /= totalProb; probBear /= totalProb; probBull /= totalProb;

  bear.prob = probBear; base.prob = probBase; bull.prob = probBull;
  const weighted = parseFloat((bear.value * probBear + base.value * probBase + bull.value * probBull).toFixed(2));
  const upside = (weighted - price) / price;

  return { available: true, bear, base, bull, weighted, upside, wacc, termGrowth, fcfPS: parseFloat(fcfPS.toFixed(2)), shares };
}

// --- 4.2: Position Sizing (Modified Kelly) ---
function buildPositionSizing(scoring, analyst, moat, price, dcf) {
  const sc = scoring.alphaScore;
  let category, emoji, range;
  if (sc >= 8.5) { category = 'Alta Convicción'; emoji = '🏆'; range = '5-8%'; }
  else if (sc >= 7.0) { category = 'Media Convicción'; emoji = '📊'; range = '2-4%'; }
  else if (sc >= 5.5) { category = 'Seguimiento'; emoji = '🔍'; range = '0%'; }
  else { category = 'No Invertir'; emoji = '❌'; range = '0%'; }

  // Half-Kelly calculation
  let kellyPct = 0;
  if (dcf?.available && dcf.upside != null) {
    const probSuccess = Math.min(0.85, Math.max(0.15, 0.5 + (sc - 5) * 0.07));
    const upside = Math.max(0.01, dcf.upside);
    const downside = Math.max(0.05, moat.rating === 'Wide' ? 0.15 : moat.rating === 'Narrow' ? 0.25 : 0.35);
    const kelly = (probSuccess * upside - (1 - probSuccess) * downside) / upside;
    kellyPct = Math.max(0, Math.min(10, kelly * 50)); // Half-Kelly, max 10%
  }
  return { category, emoji, range, kellyPct: parseFloat(kellyPct.toFixed(1)), alphaScore: sc };
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

// --- v3.0 Scoring Engine: 5-Pillar Dynamic Weights ---
function buildScoring(hist, sec, moat, analyst, price, ratiosTTM, earningsQual, earningsRevisions, dcf) {
  const lerp = (val, inLow, inHigh, outLow, outHigh) => {
    if (val <= inLow) return outLow; if (val >= inHigh) return outHigh;
    return outLow + (val - inLow) / (inHigh - inLow) * (outHigh - outLow);
  };
  const scoreValDev = (dev) => {
    if (dev == null) return null;
    if (dev <= -0.30) return 10.0; if (dev <= -0.10) return lerp(dev, -0.30, -0.10, 10.0, 7.5);
    if (dev <= 0) return lerp(dev, -0.10, 0, 7.5, 5.0); if (dev <= 0.10) return lerp(dev, 0, 0.10, 5.0, 3.5);
    if (dev <= 0.25) return lerp(dev, 0.10, 0.25, 3.5, 1.5); if (dev <= 0.40) return lerp(dev, 0.25, 0.40, 1.5, 0.0);
    return 0.0;
  };
  const scoreQualDev = (dev) => {
    if (dev == null) return null;
    if (dev >= 0.30) return 10.0; if (dev >= 0.10) return lerp(dev, 0.10, 0.30, 7.5, 10.0);
    if (dev >= 0) return lerp(dev, 0, 0.10, 5.0, 7.5); if (dev >= -0.10) return lerp(dev, -0.10, 0, 3.0, 5.0);
    if (dev >= -0.25) return lerp(dev, -0.25, -0.10, 1.0, 3.0); return 0.5;
  };
  const avgValid = (arr) => { const v = arr.filter(s => s != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 5.0; };

  // PILLAR 1: Business Quality (30%) — ROIC, margins, growth, earnings quality
  const roicScore = scoreQualDev(hist.deviation.roic);
  const marginScore = scoreQualDev(hist.deviation.opMargin);
  const growthScore = scoreQualDev(hist.deviation.revGrowth);
  const eqScore = earningsQual ? earningsQual.score : 5;
  const bizQuality = avgValid([roicScore, marginScore, growthScore, eqScore]);

  // PILLAR 2: Moat Strength (25%)
  let moatBase = moat.rating === 'Wide' ? 8.0 : moat.rating === 'Narrow' ? 5.0 : 2.0;
  if (hist.current.roic != null) {
    if (hist.current.roic > 0.30) moatBase += 1.5;
    else if (hist.current.roic > 0.20) moatBase += lerp(hist.current.roic, 0.20, 0.30, 0.5, 1.5);
    else if (hist.current.roic > 0.12) moatBase += lerp(hist.current.roic, 0.12, 0.20, 0, 0.5);
    else if (hist.current.roic < 0.08) moatBase -= lerp(hist.current.roic, 0.02, 0.08, 2.0, 0.5);
  }
  if (hist.current.opMargin != null && hist.current.opMargin > 0.25) moatBase += 0.5;
  const moatScore = Math.min(10.0, Math.max(0.0, moatBase));

  // PILLAR 3: Valuation (20%) — historical + sector + DCF + analyst consensus
  const histValScore = avgValid([scoreValDev(hist.deviation.pe), scoreValDev(hist.deviation.pfcf), scoreValDev(hist.deviation.evEbitda), scoreValDev(hist.deviation.forwardPE)]);
  const secValScore = avgValid([scoreValDev(sec.deviation.pe), scoreValDev(sec.deviation.pfcf), scoreValDev(sec.deviation.evEbitda)]);
  let dcfScore = 5;
  if (dcf?.available && dcf.upside != null) {
    if (dcf.upside >= 0.30) dcfScore = 9; else if (dcf.upside >= 0.15) dcfScore = lerp(dcf.upside, 0.15, 0.30, 7, 9);
    else if (dcf.upside >= 0) dcfScore = lerp(dcf.upside, 0, 0.15, 5, 7);
    else if (dcf.upside >= -0.15) dcfScore = lerp(dcf.upside, -0.15, 0, 2.5, 5); else dcfScore = 1.5;
  }
  let analystUpScore = 5;
  if (analyst.upside != null) {
    if (analyst.upside >= 0.30) analystUpScore = 9; else if (analyst.upside >= 0.15) analystUpScore = lerp(analyst.upside, 0.15, 0.30, 7, 9);
    else if (analyst.upside >= 0) analystUpScore = lerp(analyst.upside, 0, 0.15, 5, 7);
    else if (analyst.upside >= -0.15) analystUpScore = lerp(analyst.upside, -0.15, 0, 2.5, 5); else analystUpScore = 1.5;
  }
  const valuation = avgValid([histValScore, secValScore, dcfScore, analystUpScore]);

  // PILLAR 4: Financial Health (15%)
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

  // PILLAR 5: Fundamental Momentum (10%) — estimate revisions + analyst consensus
  const revScore = earningsRevisions?.available ? earningsRevisions.score : 5;
  let recScore = 5;
  if (analyst.recommendationMean != null) {
    const rm = analyst.recommendationMean;
    if (rm <= 1.0) recScore = 10; else if (rm <= 2.0) recScore = lerp(rm, 1, 2, 10, 7.5);
    else if (rm <= 2.5) recScore = lerp(rm, 2, 2.5, 7.5, 5.5); else if (rm <= 3.0) recScore = lerp(rm, 2.5, 3, 5.5, 4);
    else if (rm <= 4.0) recScore = lerp(rm, 3, 4, 4, 2); else recScore = 1;
  }
  const momentum = avgValid([revScore, recScore]);

  // Weighted Final
  const W = SCORE_WEIGHTS;
  const rawScore = W.bizQuality.weight * bizQuality + W.moatScore.weight * moatScore
    + W.valuation.weight * valuation + W.healthScore.weight * healthScore + W.momentum.weight * momentum;
  let alphaScore = parseFloat(Math.min(10.0, Math.max(0.1, rawScore)).toFixed(1));

  // Overvalued Cap
  let isOvervalued = false;
  if (analyst.upside != null && analyst.upside < -0.05) isOvervalued = true;
  const avgMD = calcAverageDev([hist.deviation.pe, hist.deviation.pfcf, hist.deviation.evEbitda]);
  if (avgMD != null && avgMD > 0.15) isOvervalued = true;
  if (isOvervalued && alphaScore > 5.0) alphaScore = 5.0;

  let verdict;
  if (isOvervalued) verdict = alphaScore <= 2.5 ? 'STRONG SELL' : alphaScore <= 3.5 ? 'SELL' : 'HOLD';
  else if (alphaScore >= 7.5) verdict = 'STRONG BUY';
  else if (alphaScore >= 6.0) verdict = 'BUY';
  else if (alphaScore >= 4.0) verdict = 'HOLD';
  else if (alphaScore >= 2.5) verdict = 'SELL';
  else verdict = 'STRONG SELL';

  return { alphaScore, verdict, isOvervalued,
    bizQuality: parseFloat(bizQuality.toFixed(1)), moatScore: parseFloat(moatScore.toFixed(1)),
    valuation: parseFloat(valuation.toFixed(1)), healthScore: parseFloat(healthScore.toFixed(1)),
    momentum: parseFloat(momentum.toFixed(1)) };
}

function calcAverageDev(devs) {
  const valid = devs.filter(v => v != null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// --- v3.0 Thesis: Compact + Structured Decision (4.1) ---
function buildThesis(meta, ctx, hist, sec, moat, scoring, analyst, ratiosTTM, metricsTTM, dcf, techData, positionSizing) {
  const price = ctx.price;
  
  // 1. DCF value
  const valDCF = dcf?.available ? dcf.weighted : null;
  
  // 2. Valor por P/E forward
  let valPE = null;
  const fwdPE = safe(ratiosTTM?.forwardPE);
  if (fwdPE && fwdPE > 0 && price && hist.avg5y.pe > 0) {
    const fwdEps = price / fwdPE;
    valPE = hist.avg5y.pe * fwdEps;
  }
  
  // 3. Valor por P/FCF
  let valPFCF = null;
  const fcfPS = safe(metricsTTM?.freeCashFlowPerShareTTM) || safe(ratiosTTM?.freeCashFlowPerShareTTM);
  if (fcfPS && fcfPS > 0 && hist.avg5y.pfcf > 0) valPFCF = hist.avg5y.pfcf * fcfPS;
  
  // 4. Blend ponderado
  const methods = [];
  if (valDCF) methods.push({v: valDCF, w: 0.4});
  if (valPE) methods.push({v: valPE, w: 0.3});
  if (valPFCF) methods.push({v: valPFCF, w: 0.3});
  
  let blend = null;
  if (methods.length > 0) {
    const totalW = methods.reduce((acc, m) => acc + m.w, 0);
    blend = methods.reduce((acc, m) => acc + m.v * (m.w / totalW), 0);
  } else if (analyst.targetMean) {
    blend = analyst.targetMean;
  }
  
  let entry = null;
  if (blend && price) {
    // 5. Ajustes al blend
    let adjFactor = 1.0;
    if (moat.rating === 'Wide') adjFactor += 0.10;
    else if (moat.rating === 'None') adjFactor -= 0.10;
    
    const fundamentalsImproving = (hist.current.roic > hist.avg5y.roic) && (hist.current.opMargin > hist.avg5y.opMargin);
    const fundamentalsDeteriorating = (hist.current.roic < hist.avg5y.roic) && (hist.current.opMargin < hist.avg5y.opMargin);
    if (fundamentalsImproving) adjFactor += 0.05;
    else if (fundamentalsDeteriorating) adjFactor -= 0.08;
    
    if (hist.current.netDebtEbitda != null && hist.current.netDebtEbitda > 3.0) adjFactor -= 0.15;
    
    const adjustedIntrinsic = blend * adjFactor;
    
    // 6. Margen de seguridad dinámico
    let margin = moat.rating === 'Wide' ? 0.12 : moat.rating === 'Narrow' ? 0.18 : 0.25;
    const estBeta = dcf?.available ? Math.max(0.5, (dcf.wacc - 0.045) / 0.055) : 1.0;
    if (estBeta > 1.2) margin += 0.05;
    if (techData?.rsi != null) {
      if (techData.rsi < 30) margin -= 0.05;
      else if (techData.rsi > 70) margin += 0.05;
    }
    margin = Math.max(0.05, Math.min(0.50, margin)); // 5% to 50%
    
    // 7. Cálculo final
    entry = adjustedIntrinsic * (1 - margin);
    
    // 8. Regla absoluta
    if (entry > price) entry = price * (1 - margin);
  }

  // Compact thesis (max ~10 lines)
  const v = scoring.verdict;
  const roicPct = hist.current.roic != null ? (hist.current.roic * 100).toFixed(1) : 'N/A';
  const opMPct = hist.current.opMargin != null ? (hist.current.opMargin * 100).toFixed(1) : 'N/A';
  let thesisText = '';
  if (v === 'STRONG BUY' || v === 'BUY') {
    thesisText = `${meta.name} presenta una oportunidad de valor para inversores a largo plazo. Cotiza con descuento respecto a sus múltiplos históricos (P/E ${hist.current.pe ? hist.current.pe.toFixed(1) + 'x' : 'N/A'} vs media 5A ${hist.avg5y.pe ? hist.avg5y.pe.toFixed(1) + 'x' : 'N/A'}). ROIC del ${roicPct}% y márgenes del ${opMPct}% confirman creación de valor económico sostenible.`;
  } else if (v === 'HOLD') {
    thesisText = `${meta.name} cotiza a niveles consistentes con su valor fundamental. La valoración actual refleja equilibrio entre perspectivas y riesgo. ROIC del ${roicPct}% y margen operativo del ${opMPct}% indican calidad sólida pero ya reflejada en precio.`;
  } else {
    thesisText = `${meta.name} parece sobrevalorada a niveles actuales. Múltiplos elevados respecto a su histórico y peers. La calidad del negocio (ROIC ${roicPct}%, márgenes ${opMPct}%) sigue siendo fuerte pero la prima actual deja margen de seguridad mínimo.`;
  }
  if (analyst.available && analyst.upside != null) {
    thesisText += ` Consenso de ${analyst.numberOfAnalysts} analistas: $${analyst.targetMean?.toFixed(2)} (${analyst.upside >= 0 ? '+' : ''}${(analyst.upside * 100).toFixed(0)}% upside).`;
  }

  // 4.1: Structured Decision
  let actionLabel, actionEmoji, strategy, horizon;
  if (v === 'STRONG BUY') { actionLabel = 'ACUMULAR'; actionEmoji = '📈'; strategy = entry ? `DCA bajo $${entry.toFixed(0)}` : 'DCA en correcciones'; horizon = '3-5 años mínimo'; }
  else if (v === 'BUY') { actionLabel = 'COMPRA SELECTIVA'; actionEmoji = '🟢'; strategy = entry ? `Entrada escalonada bajo $${entry.toFixed(0)}` : 'Esperar pullback'; horizon = '2-4 años'; }
  else if (v === 'HOLD') { actionLabel = 'MANTENER / ESPERAR'; actionEmoji = '⏸️'; strategy = 'No abrir posición nueva'; horizon = 'Reevaluar en 3-6 meses'; }
  else if (v === 'SELL') { actionLabel = 'REDUCIR'; actionEmoji = '🟡'; strategy = 'Reducir exposición gradualmente'; horizon = 'Salida en 1-3 meses'; }
  else { actionLabel = 'VENDER'; actionEmoji = '🔴'; strategy = 'Liquidar posición'; horizon = 'Inmediato'; }

  return { 
    thesisText, 
    entryPrice: entry,
    priceJustification: `El suggested entry price dinámico ajustado al perfil institucional es de <strong>$${entry?.toFixed(2) || 'N/A'}</strong>.`,
    decision: { actionLabel, actionEmoji, positionRange: positionSizing?.range || '0%', strategy, horizon } 
  };
}
