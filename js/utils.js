// ============================================
// AlphaFundamental — Utility Functions
// ============================================

export function formatCurrency(value) {
  if (value == null || isNaN(value)) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function formatLargeNumber(value) {
  if (value == null || isNaN(value)) return 'N/A';
  const abs = Math.abs(value);
  if (abs >= 1e12) return (value / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return (value / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (value / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (value / 1e3).toFixed(2) + 'K';
  return value.toFixed(2);
}

export function formatPercent(value, decimals = 1) {
  if (value == null || isNaN(value)) return 'N/A';
  return (value * 100).toFixed(decimals) + '%';
}

export function formatRatio(value, decimals = 1) {
  if (value == null || isNaN(value)) return 'N/A';
  return parseFloat(value).toFixed(decimals) + 'x';
}

export function calcAverage(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v) && isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function calcDeviation(current, reference) {
  if (current == null || reference == null || reference === 0) return null;
  return (current - reference) / Math.abs(reference);
}

// For valuation ratios where LOWER is better (PE, P/FCF, etc): below ref = Por debajo
export function deviationLabel(dev) {
  if (dev == null) return 'N/A';
  const pct = Math.abs(dev * 100).toFixed(1);
  if (dev < -0.02) return `▼ ${pct}% Por debajo`;
  if (dev > 0.02) return `▲ ${pct}% Por encima`;
  return '≈ En línea';
}

// For quality metrics where HIGHER is better (ROIC, Margin, Growth): above ref = Por encima
export function deviationLabelROIC(dev) {
  if (dev == null) return 'N/A';
  const pct = Math.abs(dev * 100).toFixed(1);
  if (dev > 0.02) return `▲ ${pct}% Por encima`;
  if (dev < -0.02) return `▼ ${pct}% Por debajo`;
  return '≈ En línea';
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
