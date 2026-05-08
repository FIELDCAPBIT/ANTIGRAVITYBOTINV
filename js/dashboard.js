// AlphaFundamental — Dashboard Client v2
const $ = id => document.getElementById(id);

let allData = null;
let sortCol = 'alpha_score', sortDir = -1;
let currentPage = 0;
const PAGE_SIZE = 20;
const TOP_N = 15;

// --- Load ---
async function loadScores() {
  try {
    const res = await fetch('/api/scores');
    const data = await res.json();
    if (!data.exists) { 
      $('onboarding').style.display = 'flex'; $('dash-content').style.display = 'none'; 
      // Auto-start if no data exists
      setTimeout(() => $('refresh-btn').click(), 1000);
      return; 
    }
    allData = data;
    $('onboarding').style.display = 'none';
    $('dash-content').style.display = 'block';
    const d = new Date(data.last_updated);
    $('dash-updated').textContent = `Última actualización: ${d.toLocaleString('es-ES')} — ${data.total_processed} empresas, ${data.total_errors} errores`;
    const valid = data.companies.filter(c => !c.error_flag);
    renderSummary(data, valid);
    renderTop15(valid.slice(0, TOP_N));
    currentPage = 0;
    renderTable(data.companies);
    renderCharts(valid);
    populateSectorFilter(data.companies);
    
    // Auto-refresh if older than 4 hours
    if (Date.now() - d.getTime() > 4 * 60 * 60 * 1000) {
      console.log('Datos antiguos, auto-actualizando...');
      setTimeout(() => { $('refresh-btn').click(); }, 1500);
    }
  } catch (e) { console.error('Failed to load scores:', e); }
}

// --- Summary ---
function renderSummary(data, valid) {
  $('sum-total').textContent = valid.length;
  const strongBuys = valid.filter(c => c.verdict === 'STRONG BUY').length;
  $('sum-buys').textContent = strongBuys;
  const top10 = valid.slice(0, 10);
  const avgUp = top10.filter(c => c.upside_potential != null).reduce((s, c) => s + c.upside_potential, 0) / (top10.filter(c => c.upside_potential != null).length || 1);
  $('sum-upside').textContent = avgUp.toFixed(1) + '%';
  const sectorCounts = {};
  top10.forEach(c => { sectorCounts[c.sector] = (sectorCounts[c.sector] || 0) + 1; });
  const topSector = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1])[0];
  $('sum-sector').textContent = topSector ? topSector[0] : '—';
}

// --- Top 15 Cards ---
function renderTop15(top) {
  const grid = $('top10-grid');
  grid.innerHTML = top.map((c, i) => {
    const vc = verdictClass(c.verdict);
    const sc = c.alpha_score >= 7.5 ? 'var(--accent)' : c.alpha_score >= 4 ? 'var(--gold)' : 'var(--red)';
    const circ = 2 * Math.PI * 36;
    const off = circ - (c.alpha_score / 10) * circ;
    const targetColor = c.analyst_target && c.current_price ? (c.current_price < c.analyst_target ? 'var(--accent)' : 'var(--red)') : 'var(--text-muted)';
    return `<div class="top10-card">
      <div class="top10-rank">#${i + 1}</div>
      <div class="top10-header">
        <div class="top10-ticker">${c.ticker}</div>
        <div class="top10-name">${c.company_name}</div>
      </div>
      <div class="top10-gauge">
        <svg viewBox="0 0 80 80" class="gauge-svg">
          <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="5"/>
          <circle cx="40" cy="40" r="36" fill="none" stroke="${sc}" stroke-width="5"
            stroke-dasharray="${circ}" stroke-dashoffset="${off}"
            transform="rotate(-90 40 40)" stroke-linecap="round"/>
        </svg>
        <div class="gauge-value" style="color:${sc}">${c.alpha_score.toFixed(1)}</div>
      </div>
      <span class="verdict-badge-sm ${vc}">${c.verdict}</span>
      <div class="top10-metrics">
        <div class="top10-metric"><span class="tm-label">Precio</span><span class="tm-value">$${c.current_price?.toFixed(2) || 'N/A'}</span></div>
        <div class="top10-metric"><span class="tm-label">Target Analistas</span><span class="tm-value" style="color:${targetColor}">$${c.analyst_target?.toFixed(2) || 'N/A'}</span></div>
        <div class="top10-metric"><span class="tm-label">Entrada Sugerida</span><span class="tm-value" style="color:var(--gold)">${c.entry_price ? '$' + c.entry_price.toFixed(2) : 'N/A'}</span></div>
        <div class="top10-metric"><span class="tm-label">Mín. 52 Sem.</span><span class="tm-value">${c.week52_low ? '$' + c.week52_low.toFixed(2) : 'N/A'}</span></div>
        <div class="top10-metric"><span class="tm-label">ROIC</span><span class="tm-value">${c.roic != null ? c.roic.toFixed(1) + '%' : 'N/A'}</span></div>
        <div class="top10-metric"><span class="tm-label">Sector</span><span class="tm-value tm-sector">${c.sector}</span></div>
      </div>
      <a href="/?ticker=${c.ticker}" class="top10-action">Ver Análisis Completo →</a>
    </div>`;
  }).join('');
}

// --- Table (from rank 16 onwards with pagination) ---
function renderTable(companies) {
  const search = $('filter-search').value.toLowerCase();
  const sector = $('filter-sector').value;
  const verdict = $('filter-verdict').value;
  const minScore = parseFloat($('filter-score').value);

  // Get all non-error sorted by score, skip top 15
  let valid = companies.filter(c => !c.error_flag);
  valid.sort((a, b) => b.alpha_score - a.alpha_score);
  let rest = valid.slice(TOP_N); // from rank 16 onwards

  // Apply filters
  let filtered = rest.filter(c => {
    if (search && !c.ticker.toLowerCase().includes(search) && !c.company_name.toLowerCase().includes(search)) return false;
    if (sector && c.sector !== sector) return false;
    if (verdict && c.verdict !== verdict) return false;
    if (c.alpha_score < minScore) return false;
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (va == null) return 1; if (vb == null) return -1;
    if (typeof va === 'string') return sortDir * va.localeCompare(vb);
    return sortDir * (va - vb);
  });

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  if (currentPage >= totalPages) currentPage = Math.max(0, totalPages - 1);
  const start = currentPage * PAGE_SIZE;
  const pageData = filtered.slice(start, start + PAGE_SIZE);

  const tbody = $('rank-tbody');
  tbody.innerHTML = pageData.map((c, i) => {
    const vc = verdictClass(c.verdict);
    const globalRank = TOP_N + rest.indexOf(c) + 1;
    const targetColor = c.analyst_target && c.current_price ? (c.current_price < c.analyst_target ? 'var(--accent)' : 'var(--red)') : '';
    return `<tr>
      <td>${globalRank}</td>
      <td><strong>${c.ticker}</strong></td>
      <td>${c.company_name}</td>
      <td>${c.sector}</td>
      <td><span class="score-pill" style="background:${c.alpha_score >= 7.5 ? 'var(--accent)' : c.alpha_score >= 4 ? 'var(--gold)' : 'var(--red)'}">${c.alpha_score.toFixed(1)}</span></td>
      <td><span class="verdict-badge-sm ${vc}">${c.verdict}</span></td>
      <td>$${c.current_price?.toFixed(2) || '—'}</td>
      <td style="color:${targetColor}">$${c.analyst_target?.toFixed(2) || '—'}</td>
      <td style="color:${(c.upside_potential||0) >= 0 ? 'var(--accent)' : 'var(--red)'}">${c.upside_potential != null ? c.upside_potential.toFixed(1) + '%' : '—'}</td>
      <td>${c.pe_ratio?.toFixed(1) || '—'}x</td>
      <td>${c.roic != null ? c.roic.toFixed(1) + '%' : '—'}</td>
      <td><a href="/?ticker=${c.ticker}" class="table-action">Analizar</a></td>
    </tr>`;
  }).join('');

  // Pagination controls
  renderPagination(totalPages, filtered.length);
}

function renderPagination(totalPages, totalItems) {
  let pag = $('pagination');
  if (!pag) { pag = document.createElement('div'); pag.id = 'pagination'; pag.className = 'pagination'; $('rank-table').parentElement.after(pag); }
  if (totalPages <= 1) { pag.innerHTML = ''; return; }
  let h = `<span class="pag-info">Mostrando ${currentPage * PAGE_SIZE + 1}-${Math.min((currentPage + 1) * PAGE_SIZE, totalItems)} de ${totalItems}</span>`;
  h += `<button class="pag-btn" ${currentPage === 0 ? 'disabled' : ''} onclick="window._dashPagPrev()">← Anterior</button>`;
  for (let i = 0; i < totalPages; i++) {
    h += `<button class="pag-btn ${i === currentPage ? 'pag-active' : ''}" onclick="window._dashPagGo(${i})">${i + 1}</button>`;
  }
  h += `<button class="pag-btn" ${currentPage >= totalPages - 1 ? 'disabled' : ''} onclick="window._dashPagNext()">Siguiente →</button>`;
  pag.innerHTML = h;
}
window._dashPagPrev = () => { currentPage--; renderTable(allData.companies); };
window._dashPagNext = () => { currentPage++; renderTable(allData.companies); };
window._dashPagGo = (p) => { currentPage = p; renderTable(allData.companies); };

function populateSectorFilter(companies) {
  const sectors = [...new Set(companies.filter(c => !c.error_flag).map(c => c.sector))].sort();
  const sel = $('filter-sector');
  sel.innerHTML = '<option value="">Todos los sectores</option>';
  sectors.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });
}

// --- Charts ---
function renderCharts(companies) {
  const palette = ['#00d4aa','#fbbf24','#3b82f6','#f97316','#8b5cf6','#ec4899','#14b8a6','#ef4444','#06b6d4','#a3e635'];

  // 1. Score medio por sector
  const sectorScores = {};
  companies.forEach(c => { if (!sectorScores[c.sector]) sectorScores[c.sector] = []; sectorScores[c.sector].push(c.alpha_score); });
  const sectorAvgs = Object.entries(sectorScores).map(([s, arr]) => ({ sector: s, avg: arr.reduce((a, b) => a + b, 0) / arr.length })).sort((a, b) => b.avg - a.avg);

  new Chart($('chart-sectors'), {
    type: 'bar',
    data: { labels: sectorAvgs.map(s => s.sector), datasets: [{ data: sectorAvgs.map(s => parseFloat(s.avg.toFixed(1))), backgroundColor: sectorAvgs.map((_, i) => palette[i % palette.length] + 'cc'), borderColor: sectorAvgs.map((_, i) => palette[i % palette.length]), borderWidth: 1 }] },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 10, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } }, y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } } } }
  });

  // 2. Oportunidades de Entrada
  const withEntry = companies.filter(c => c.entry_price && c.current_price && c.alpha_score >= 4)
    .map(c => ({ ...c, gap: ((c.current_price - c.entry_price) / c.entry_price) * 100 }))
    .sort((a, b) => a.gap - b.gap).slice(0, 10);

  const entryEl = $('chart-entry-content');
  if (entryEl) {
    entryEl.innerHTML = withEntry.map(c => {
      const col = c.gap <= 5 ? 'var(--accent)' : c.gap <= 15 ? 'var(--gold)' : 'var(--red)';
      return `<div class="range52-row">
        <a href="index.html?ticker=${c.ticker}" class="range52-ticker" style="text-decoration:none;color:var(--text);font-weight:600;display:inline-block;cursor:pointer;">${c.ticker}</a>
        <div class="range52-bar-wrap" style="position:relative;background:rgba(255,255,255,0.05);height:20px;border-radius:4px;overflow:hidden;flex:1;cursor:pointer;" onclick="window.location.href='index.html?ticker=${c.ticker}'">
          <div style="position:absolute;left:0;top:0;height:100%;background:${col}99;border-right:2px solid ${col};width:${Math.min(100, c.gap)}%;"></div>
          <div style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:600;">${c.gap.toFixed(1)}% sobre entrada</div>
        </div>
      </div>`;
    }).join('');
  }

  // 3. Posición en Rango 52W (Top 20 por score)
  const with52w = companies.filter(c => c.week52_high && c.week52_low && c.current_price)
    .map(c => ({ ...c, pos52: ((c.current_price - c.week52_low) / (c.week52_high - c.week52_low)) * 100 }))
    .sort((a, b) => a.pos52 - b.pos52).slice(0, 20);

  const range52El = $('chart-52w-content');
  range52El.innerHTML = with52w.map(c => {
    const pos = Math.max(0, Math.min(100, c.pos52));
    const col = pos < 30 ? 'var(--accent)' : pos < 70 ? 'var(--gold)' : 'var(--red)';
    return `<div class="range52-row">
      <a href="index.html?ticker=${c.ticker}" class="range52-ticker" style="text-decoration:none;color:var(--text);font-weight:600;display:inline-block;cursor:pointer;">${c.ticker}</a>
      <div class="range52-bar-wrap">
        <div class="range52-bar"><div class="range52-marker" style="left:${pos}%;background:${col}"></div></div>
        <div class="range52-labels"><span>$${c.week52_low.toFixed(0)}</span><span style="color:${col}">$${c.current_price.toFixed(0)} (${pos.toFixed(0)}%)</span><span>$${c.week52_high.toFixed(0)}</span></div>
      </div>
    </div>`;
  }).join('');

  // 4. Upside vs Consenso (Top 15 por upside)
  const topUpside = companies.filter(c => c.upside_potential != null && c.upside_potential > 0)
    .sort((a, b) => b.upside_potential - a.upside_potential).slice(0, 15);

  const upsideEl = $('chart-upside-content');
  if (upsideEl) {
    upsideEl.innerHTML = topUpside.map(c => {
      const colMap = { 'STRONG BUY': 'var(--accent)', 'BUY': '#34d399', 'HOLD': 'var(--gold)', 'SELL': '#f97316', 'STRONG SELL': 'var(--red)' };
      const col = colMap[c.verdict] || 'var(--text-muted)';
      // Max upside in array to scale width
      const maxUp = topUpside[0]?.upside_potential || 100;
      const pct = (c.upside_potential / maxUp) * 100;
      return `<div class="range52-row">
        <a href="index.html?ticker=${c.ticker}" class="range52-ticker" style="text-decoration:none;color:var(--text);font-weight:600;display:inline-block;cursor:pointer;">${c.ticker}</a>
        <div class="range52-bar-wrap" style="position:relative;background:rgba(255,255,255,0.05);height:20px;border-radius:4px;overflow:hidden;flex:1;cursor:pointer;" onclick="window.location.href='index.html?ticker=${c.ticker}'">
          <div style="position:absolute;left:0;top:0;height:100%;background:${col};opacity:0.6;border-right:2px solid ${col};width:${pct}%;"></div>
          <div style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:600;color:#fff;">+${c.upside_potential.toFixed(1)}% upside</div>
        </div>
      </div>`;
    }).join('');
  }
}

// --- Refresh ---
$('refresh-btn').addEventListener('click', () => {
  const prog = $('refresh-progress');
  const log = $('refresh-log');
  const bar = $('refresh-bar-fill');
  prog.style.display = 'block';
  log.textContent = '';
  bar.style.width = '0%';
  $('refresh-btn').disabled = true;

  const es = new EventSource('/api/refresh');
  es.onmessage = e => {
    const text = e.data;
    if (text.startsWith('[DONE]')) {
      es.close(); bar.style.width = '100%'; log.textContent += '\n' + text;
      $('refresh-btn').disabled = false;
      setTimeout(() => { prog.style.display = 'none'; window.location.reload(); }, 1500);
      return;
    }
    log.textContent += text + '\n';
    log.scrollTop = log.scrollHeight;
    const match = text.match(/(\d+)\/(\d+)/);
    if (match) bar.style.width = (parseInt(match[1]) / parseInt(match[2]) * 100) + '%';
  };
  es.onerror = () => { es.close(); $('refresh-btn').disabled = false; };
});

// --- Sorting ---
document.querySelectorAll('#rank-table th[data-sort]').forEach(th => {
  th.style.cursor = 'pointer';
  th.addEventListener('click', () => {
    const col = th.dataset.sort;
    if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = col === 'alpha_score' || col === 'upside_potential' || col === 'roic' ? -1 : 1; }
    currentPage = 0;
    renderTable(allData.companies);
  });
});

// --- Filters ---
$('filter-search').addEventListener('input', () => { currentPage = 0; renderTable(allData.companies); });
$('filter-sector').addEventListener('change', () => { currentPage = 0; renderTable(allData.companies); });
$('filter-verdict').addEventListener('change', () => { currentPage = 0; renderTable(allData.companies); });
$('filter-score').addEventListener('input', e => { $('score-min-val').textContent = e.target.value; currentPage = 0; renderTable(allData.companies); });

function verdictClass(v) {
  return { 'STRONG BUY': 'verdict-strongbuy', 'BUY': 'verdict-buy', 'HOLD': 'verdict-hold', 'SELL': 'verdict-sell', 'STRONG SELL': 'verdict-strongsell' }[v] || 'verdict-hold';
}

// --- Init ---
loadScores();
