import { TICKERS_DATA, TICKER_LIST } from './tickers.js';
import { fetchAllData } from './api.js';
import { runAnalysis, SCORE_WEIGHTS } from './analysis.js';
import { formatCurrency, formatLargeNumber, formatPercent, formatRatio, deviationLabel, deviationLabelROIC } from './utils.js';

const $ = id => document.getElementById(id);
const searchInput = $('search-input'), searchBtn = $('search-btn'), acList = $('autocomplete-list');
const loadingEl = $('loading'), loadingText = $('loading-text'), loadingBar = $('loading-bar');
const errorEl = $('error-msg'), reportEl = $('report');
let selectedTicker = null, acIndex = -1;

function filterTickers(q) { q=q.toUpperCase().trim(); if(!q) return []; return TICKER_LIST.filter(t=>t.ticker.startsWith(q)||t.name.toUpperCase().includes(q)).slice(0,8); }
function renderAC(items) { acList.innerHTML=''; if(!items.length){acList.classList.remove('show');return;} items.forEach((item,i)=>{const d=document.createElement('div');d.className='ac-item'+(i===acIndex?' active':'');d.innerHTML=`<span class="ac-ticker">${item.ticker}</span><span class="ac-name">${item.name}</span>`;d.addEventListener('mousedown',()=>selectTicker(item.ticker));acList.appendChild(d);});acList.classList.add('show'); }
function selectTicker(t){selectedTicker=t;searchInput.value=t;acList.classList.remove('show');acIndex=-1;}
searchInput.addEventListener('input',()=>{renderAC(filterTickers(searchInput.value));acIndex=-1;selectedTicker=null;});
searchInput.addEventListener('keydown',e=>{const items=acList.querySelectorAll('.ac-item');if(e.key==='ArrowDown'){e.preventDefault();acIndex=Math.min(acIndex+1,items.length-1);items.forEach((el,i)=>el.classList.toggle('active',i===acIndex));}else if(e.key==='ArrowUp'){e.preventDefault();acIndex=Math.max(acIndex-1,0);items.forEach((el,i)=>el.classList.toggle('active',i===acIndex));}else if(e.key==='Enter'){e.preventDefault();if(acIndex>=0&&items[acIndex])selectTicker(items[acIndex].querySelector('.ac-ticker').textContent);else{const v=searchInput.value.toUpperCase().trim();if(TICKERS_DATA[v])selectTicker(v);}runReport();}else if(e.key==='Escape')acList.classList.remove('show');});
searchInput.addEventListener('blur',()=>setTimeout(()=>acList.classList.remove('show'),150));
document.querySelectorAll('.pill').forEach(p=>p.addEventListener('click',()=>{selectTicker(p.dataset.ticker);runReport();}));
searchBtn.addEventListener('click',()=>{const v=searchInput.value.toUpperCase().trim();if(!selectedTicker&&TICKERS_DATA[v])selectedTicker=v;runReport();});

// Auto-run from URL param (e.g. /?ticker=MSFT from dashboard)
const urlTicker = new URLSearchParams(window.location.search).get('ticker');
if (urlTicker && TICKERS_DATA[urlTicker.toUpperCase()]) {
  selectTicker(urlTicker.toUpperCase());
  setTimeout(() => runReport(), 300);
}

async function runReport(){
  const ticker=selectedTicker||searchInput.value.toUpperCase().trim();
  if(!ticker)return;
  if(!TICKERS_DATA[ticker]){showError(`"${ticker}" no está en el universo AlphaFundamental.`);return;}
  hideError();reportEl.classList.remove('show');loadingEl.classList.add('show');searchBtn.disabled=true;loadingBar.style.width='0%';
  try{
    const apiData=await fetchAllData(ticker,(msg,pct)=>{loadingText.textContent=msg;loadingBar.style.width=(pct*100)+'%';});
    const result=runAnalysis(ticker,apiData);
    if(!result)throw new Error('El motor de análisis no devolvió resultado.');
    renderReport(result);
  }catch(err){showError(`Análisis fallido: ${err.message}`);}finally{loadingEl.classList.remove('show');searchBtn.disabled=false;}
}

function renderReport(r){
  const{context,historical,sector,moat,analyst,insiderData,techData,scoring,thesis,meta,
    earningsQual,lifecycle,meanReversion,earningsRevisions,dcf,positionSizing}=r;
  $('r-company').innerHTML=`${context.companyName} <span class="ticker">($${meta.ticker})</span>`;
  $('r-sector').textContent=context.sector||meta.sector;
  $('r-industry').textContent=context.industry||meta.industry;
  $('r-price').textContent=context.price?formatCurrency(context.price):'N/A';
  $('r-mktcap').textContent=context.mktCap?formatLargeNumber(context.mktCap):'N/A';
  $('r-context').textContent=context.description;

  // S2: Valuation table
  const tb=$('r-val-table');
  const R=buildValRow;
  tb.innerHTML=R('P/E (Trailing)',historical.current.pe,historical.avg5y.pe,sector.sectorAvg.pe,historical.deviation.pe,sector.deviation.pe,formatRatio,false)
    +R('P/E (Forward)',historical.current.forwardPE,historical.avg5y.forwardPE,sector.sectorAvg.forwardPE,historical.deviation.forwardPE,sector.deviation.forwardPE,formatRatio,false)
    +R('P/FCF',historical.current.pfcf,historical.avg5y.pfcf,sector.sectorAvg.pfcf,historical.deviation.pfcf,sector.deviation.pfcf,formatRatio,false)
    +R('EV/EBITDA',historical.current.evEbitda,historical.avg5y.evEbitda,sector.sectorAvg.evEbitda,historical.deviation.evEbitda,sector.deviation.evEbitda,formatRatio,false)
    +R('PEG Ratio',historical.current.peg,historical.avg5y.peg,sector.sectorAvg.peg,historical.deviation.peg,sector.deviation.peg,formatRatio,false)
    +R('ROIC',historical.current.roic,historical.avg5y.roic,sector.sectorAvg.roic,historical.deviation.roic,sector.deviation.roic,formatPercent,true)
    +R('Rev. Growth YoY',historical.current.revGrowth,historical.avg5y.revGrowth,sector.sectorAvg.revGrowth,historical.deviation.revGrowth,sector.deviation.revGrowth,formatPercent,true)
    +R('Net Debt/EBITDA',historical.current.netDebtEbitda,historical.avg5y.netDebtEbitda,sector.sectorAvg.netDebtEbitda,historical.deviation.netDebtEbitda,sector.deviation.netDebtEbitda,v=>{if(v==null)return 'N/A';if(v<0)return'Net Cash';return v.toFixed(1)+'x';},false,historical.current.netDebtEbitda!=null&&historical.current.netDebtEbitda<0)
    +R('Op. Margin',historical.current.opMargin,historical.avg5y.opMargin,sector.sectorAvg.opMargin,historical.deviation.opMargin,sector.deviation.opMargin,formatPercent,true);
  if(historical.current.pfcf!=null && historical.current.pfcf > 40){
    tb.innerHTML+=`<tr><td colspan="6" style="font-size:12px;color:var(--gold);padding:8px 12px;font-style:italic;">⚠️ El FCF reportado puede estar comprimido por inversiones extraordinarias en capex (ej: infraestructura cloud/IA). Considera analizar el FCF normalizado.</td></tr>`;
  }

  const aHD=avgDev([historical.deviation.pe,historical.deviation.pfcf,historical.deviation.evEbitda]);
  const aSD=avgDev([sector.deviation.pe,sector.deviation.pfcf,sector.deviation.evEbitda]);
  let sy=[];
  if(aHD!==null){if(aHD<-0.05)sy.push(`Cotiza con un <strong>${Math.abs(aHD*100).toFixed(0)}% de descuento</strong> respecto a sus múltiplos medios de 5 años.`);else if(aHD>0.05)sy.push(`Cotiza con una <strong>prima del ${(aHD*100).toFixed(0)}%</strong> respecto a sus múltiplos medios de 5 años.`);else sy.push('En línea con las medias históricas de 5 años.');}
  if(aSD!==null){if(aSD<-0.05)sy.push(`<strong>${Math.abs(aSD*100).toFixed(0)}% más barata</strong> que la media del sector.`);else if(aSD>0.05)sy.push(`Lleva una <strong>prima del ${(aSD*100).toFixed(0)}%</strong> sobre sus peers del sector.`);}
  $('r-synthesis').innerHTML=sy.join(' ');

  // New v3.0 renders in S2
  renderEarningsQuality(earningsQual);
  renderLifecycle(lifecycle);
  renderMeanReversion(meanReversion);

  // S3: Earnings Revisions removed by user request

  renderAnalyst(analyst,context.price);

  // S5: DCF
  renderDCF(dcf,context.price);

  renderInsider(insiderData);
  renderMoat(moat,meta,historical.current);
  renderTech(techData,context.price,meta.ticker);
  renderScore(scoring);
  renderThesis(thesis, positionSizing);
  renderNews(meta.ticker);

  reportEl.classList.add('show');
  reportEl.querySelectorAll('.section-card').forEach((c,i)=>{c.classList.remove('visible');setTimeout(()=>c.classList.add('visible'),120*(i+1));});
  setTimeout(()=>reportEl.scrollIntoView({behavior:'smooth',block:'start'}),300);
}

function renderAnalyst(a,price){
  const el=$('r-analyst-content');
  if(!a.available){el.innerHTML='<p style="color:var(--text-muted)">Sin datos de cobertura de analistas para esta acción.</p>';return;}
  const rk=(a.recommendationKey||'hold').replace('_','-');
  const rl=(a.recommendationKey||'Hold').replace(/_/g,' ').toUpperCase();
  const up=a.upside!=null?(a.upside*100).toFixed(1):null;
  const uc=a.upside>=0?'var(--accent)':'var(--red)';
  let h=`<span class="rec-badge rec-${rk}">${rl}</span><div class="analyst-grid">`;
  h+=`<div class="analyst-stat-card"><div class="analyst-stat-label">Precio Objetivo Consenso</div><div class="analyst-stat-value" style="color:var(--accent)">$${a.targetMean?.toFixed(2)||'N/A'}</div><div class="analyst-stat-sub">${a.numberOfAnalysts||0} analistas</div></div>`;
  h+=`<div class="analyst-stat-card"><div class="analyst-stat-label">Upside Implícito</div><div class="analyst-stat-value" style="color:${uc}">${up!=null?(a.upside>=0?'+':'')+up+'%':'N/A'}</div><div class="analyst-stat-sub">desde $${price?.toFixed(2)||'N/A'}</div></div></div>`;
  if(a.targetLow&&a.targetHigh&&price){
    const lo=a.targetLow,hi=a.targetHigh,rng=hi-lo||1;
    const pp=Math.max(0,Math.min(100,((price-lo)/rng)*100));
    const mp=a.targetMean?Math.max(0,Math.min(100,((a.targetMean-lo)/rng)*100)):null;
    h+=`<div class="target-range-wrap"><div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;">Rango de Precio Objetivo</div><div class="target-range-bar"><div class="target-range-fill"></div><div class="target-marker target-marker-price" style="left:${pp}%"><div class="target-marker-label" style="color:#fff">Actual $${price.toFixed(0)}</div></div>`;
    if(mp!=null)h+=`<div class="target-marker target-marker-mean" style="left:${mp}%"><div class="target-marker-label" style="color:var(--accent)">Objetivo $${a.targetMean.toFixed(0)}</div></div>`;
    h+=`</div><div class="target-labels"><span>$${lo.toFixed(0)} (Min)</span><span>$${a.targetMedian?.toFixed(0)||''} (Mediana)</span><span>$${hi.toFixed(0)} (Max)</span></div></div>`;
  }
  h+=`<div class="rec-breakdown">`;
  h+=`<div class="rec-count"><div class="rec-count-num" style="color:var(--accent)">${a.strongBuy}</div><div class="rec-count-label">Strong Buy</div></div>`;
  h+=`<div class="rec-count"><div class="rec-count-num" style="color:#34d399">${a.buy}</div><div class="rec-count-label">Buy</div></div>`;
  h+=`<div class="rec-count"><div class="rec-count-num" style="color:var(--gold)">${a.hold}</div><div class="rec-count-label">Hold</div></div>`;
  h+=`<div class="rec-count"><div class="rec-count-num" style="color:var(--orange)">${a.sell}</div><div class="rec-count-label">Sell</div></div>`;
  h+=`<div class="rec-count"><div class="rec-count-num" style="color:var(--red)">${a.strongSell}</div><div class="rec-count-label">Str. Sell</div></div></div>`;
  const ev=[];
  if(a.earningsDate)ev.push(`📅 Earnings: ${a.earningsDate}`);
  if(a.dividendDate)ev.push(`💵 Dividendo: ${a.dividendDate}`);
  if(a.exDividendDate)ev.push(`📌 Ex-Div: ${a.exDividendDate}`);
  if(ev.length)h+=`<div class="upcoming-events">${ev.map(e=>`<div class="event-chip">${e}</div>`).join('')}</div>`;
  el.innerHTML=h;
}

function renderInsider(d){
  const el=$('r-insider-content');
  const isNeutral = d.signal.includes('Neutral');
  const sc=d.signal==='Alcista'?'signal-bullish':isNeutral?'signal-neutral':'signal-bearish';
  let h=`<span class="insider-signal ${sc}">Señal Insider: ${d.signal}</span>`;
  const act=d.activity;
  if(act.buyShares!=null||act.sellShares!=null){
    const nc=(act.netShares||0)>=0?'var(--accent)':'var(--red)';
    h+=`<div class="insider-activity-cards"><div class="insider-act-card"><div class="insider-act-num" style="color:var(--accent)">${formatLargeNumber(act.buyShares||0)}</div><div class="insider-act-label">Acciones Compradas</div></div><div class="insider-act-card"><div class="insider-act-num" style="color:var(--red)">${formatLargeNumber(act.sellShares||0)}</div><div class="insider-act-label">Acciones Vendidas</div></div><div class="insider-act-card"><div class="insider-act-num" style="color:${nc}">${formatLargeNumber(act.netShares||0)}</div><div class="insider-act-label">Actividad Neta</div></div></div>`;
  }
  if(d.institutions.length>0){
    h+=`<div style="font-size:13px;color:var(--text-muted);margin:16px 0 8px;">PRINCIPALES TITULARES INSTITUCIONALES</div>`;
    h+=`<table class="inst-table"><thead><tr><th>Institución</th><th>% Posición</th><th>Fecha Reporte</th></tr></thead><tbody>`;
    d.institutions.forEach(i=>{h+=`<tr><td>${i.name}</td><td>${i.pctHeld!=null?(i.pctHeld*100).toFixed(2)+'%':'N/A'}</td><td>${i.reportDate||'N/A'}</td></tr>`;});
    h+=`</tbody></table>`;
  }
  el.innerHTML=h;
}

function renderMoat(moat,meta,cur){
  const el=$('r-moat-content');
  const mc=moat.rating==='Wide'?'moat-wide':moat.rating==='Narrow'?'moat-narrow':'moat-none';
  const mLabel=moat.rating==='Wide'?'Moat Amplio':moat.rating==='Narrow'?'Moat Estrecho':'Sin Moat';
  let h=`<span class="moat-badge ${mc}">${mLabel}</span>`;
  h+=`<div class="moat-subsection"><div class="moat-sub-title">5A — Análisis del Moat</div>`;
  const md = moat.moatExplanation || `${meta.name} — análisis de moat no disponible.`;

  h+=`<p class="moat-narrative">${md}</p><div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">FUENTES DEL MOAT</div>`;
  h+=`<div class="moat-sources">${moat.sources.length>0?moat.sources.map(s=>`<span class="moat-source-tag">${s}</span>`).join(''):'<span style="color:var(--text-muted);font-size:13px">Ninguna identificada</span>'}</div></div>`;
  h+=`<div class="moat-subsection"><div class="moat-sub-title">5B — Durabilidad & Tendencia del Moat</div><p class="moat-narrative">El moat está actualmente <strong>${moat.expanding}</strong>. Horizonte de durabilidad estimado: <span class="durability-badge">🛡️ ${moat.durability}</span></p></div>`;
  h+=`<div class="moat-subsection"><div class="moat-sub-title">5C — Matriz de Riesgos</div><div class="risk-matrix">`;
  moat.risks.forEach((risk,i)=>{
    const prob=i===0?'Media':'Baja';const probC=i===0?'risk-medium':'risk-low';
    h+=`<div class="risk-card"><div class="risk-card-header"><div class="risk-card-title">${translateRisk(risk)}</div><div class="risk-badges"><span class="risk-prob ${probC}">Probabilidad: ${prob}</span><span class="risk-impact risk-high">Impacto: Alto</span></div></div><div class="risk-mitigant">Mitigante: ${moat.rating==='Wide'?'El moat fuerte proporciona un colchón contra este riesgo':'Monitorizar de cerca — protección estructural limitada'}</div></div>`;
  });
  h+=`</div></div>`;
  el.innerHTML=h;
}

function renderTech(t,price,ticker){
  const el=$('r-tech-content');
  if(!t){el.innerHTML='<p style="color:var(--text-muted)">Datos técnicos no disponibles.</p>';return;}
  const fmtP=v=>v!=null?'$'+v.toFixed(2):'N/A';
  const fmtR=v=>v!=null?(v>=0?'+':'')+(v*100).toFixed(1)+'%':'N/A';
  const trendC=t.trend==='Alcista'?'tech-bullish':t.trend==='Bajista'?'tech-bearish':'tech-neutral';
  const rsiC=t.rsiBand==='Sobrecompra'?'tech-bearish':t.rsiBand==='Sobreventa'?'tech-bullish':'tech-neutral';

  let h=`<div class="tech-grid">`;
  h+=`<div class="tech-card"><div class="tech-card-label">Máximo 52 Semanas</div><div class="tech-card-value" style="color:var(--accent)">${fmtP(t.high52w)}</div><div class="tech-card-sub">${price&&t.high52w?((price/t.high52w-1)*100).toFixed(1)+'% desde máximo':''}</div></div>`;
  h+=`<div class="tech-card"><div class="tech-card-label">Mínimo 52 Semanas</div><div class="tech-card-value" style="color:var(--red)">${fmtP(t.low52w)}</div><div class="tech-card-sub">${price&&t.low52w?'+'+((price/t.low52w-1)*100).toFixed(1)+'% desde mínimo':''}</div></div>`;
  h+=`<div class="tech-card"><div class="tech-card-label">Soporte Clave (Pivot S1)</div><div class="tech-card-value">${fmtP(t.support)}</div></div>`;
  h+=`<div class="tech-card"><div class="tech-card-label">Resistencia Clave (Pivot R1)</div><div class="tech-card-value">${fmtP(t.resistance)}</div></div>`;
  h+=`</div>`;

  h+=`<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">MEDIAS MÓVILES & TENDENCIA</div>`;
  h+=`<div class="sma-row">`;
  if(t.sma100d!=null){const abv=price>t.sma100d;h+=`<div class="sma-item">SMA 100d: ${fmtP(t.sma100d)} <span class="tech-signal ${abv?'tech-bearish':'tech-bullish'}">${abv?'▲ Por encima':'▼ Por debajo'}</span></div>`;}
  if(t.sma200d!=null){const abv=price>t.sma200d;h+=`<div class="sma-item">SMA 200d: ${fmtP(t.sma200d)} <span class="tech-signal ${abv?'tech-bearish':'tech-bullish'}">${abv?'▲ Por encima':'▼ Por debajo'}</span></div>`;}
  h+=`<div class="sma-item">Tendencia: <span class="tech-signal ${trendC}">${t.trend}</span></div></div>`;

  if(t.low52w&&t.high52w&&price){
    const rng=t.high52w-t.low52w||1;
    const pos=Math.max(0,Math.min(100,((price-t.low52w)/rng)*100));
    h+=`<div style="margin-top:16px"><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">POSICIÓN EN RANGO 52 SEMANAS</div>`;
    h+=`<div class="tech-range-bar"><div class="tech-range-marker" style="left:${pos}%"></div></div>`;
    h+=`<div class="tech-range-labels"><span>${fmtP(t.low52w)}</span><span>Actual: ${fmtP(price)}</span><span>${fmtP(t.high52w)}</span></div></div>`;
  }

  h+=`<div class="tech-returns">`;
  h+=`<div class="tech-ret-card"><div class="tech-ret-value" style="color:${t.ret1y>=0?'var(--accent)':'var(--red)'}">${fmtR(t.ret1y)}</div><div class="tech-ret-label">Return ${ticker} último año</div></div>`;
  h+=`<div class="tech-ret-card"><div class="tech-ret-value" style="color:${t.ret3y>=0?'var(--accent)':'var(--red)'}">${fmtR(t.ret3y)}</div><div class="tech-ret-label">Return ${ticker} 3 años</div></div>`;
  h+=`<div class="tech-ret-card"><div class="tech-ret-value" style="color:${t.spyReturn1y>=0?'var(--accent)':'var(--red)'}">${fmtR(t.spyReturn1y)}</div><div class="tech-ret-label">Return S&P 500 último año</div></div>`;
  h+=`</div>`;

  if(t.rsi!=null){
    h+=`<div class="tech-rsi-wrap"><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">RSI (14) — <span class="tech-signal ${rsiC}">${t.rsiBand} (${t.rsi.toFixed(0)})</span></div>`;
    h+=`<div class="tech-rsi-bar"><div class="tech-rsi-marker" style="left:${t.rsi}%"></div></div>`;
    h+=`<div class="tech-rsi-labels"><span>Sobreventa (30)</span><span>Neutral</span><span>Sobrecompra (70)</span></div></div>`;
  }

  // Weekly alert placeholder
  h += `<div id="weekly-alert"></div>`;
  el.innerHTML=h;

  // Async: check weekly return and fetch news if significant
  if(t.ret1w != null && Math.abs(t.ret1w) >= 0.10) {
    const pct = (t.ret1w * 100).toFixed(1);
    const isUp = t.ret1w > 0;
    const alertColor = isUp ? 'var(--red)' : 'var(--accent)';
    const direction = isUp ? '📈 SUBIDA' : '📉 BAJADA';
    let alertH = `<div class="weekly-alert-box" style="border-color:${alertColor}">`;
    alertH += `<div class="weekly-alert-header" style="color:${alertColor}">${direction} SIGNIFICATIVA: ${isUp?'+':''}${pct}% en la última semana</div>`;
    alertH += `<div class="weekly-alert-body">Buscando contexto de mercado...</div></div>`;
    $('weekly-alert').innerHTML = alertH;

    // Fetch news
    fetch(`/api/news/${ticker}`).then(r=>r.json()).then(data => {
      if(data.news && data.news.length > 0) {
        let newsH = `<div class="weekly-alert-box" style="border-color:${alertColor}">`;
        newsH += `<div class="weekly-alert-header" style="color:${alertColor}">${direction} SIGNIFICATIVA: ${isUp?'+':''}${pct}% en la última semana</div>`;
        newsH += `<div class="weekly-alert-body"><div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">NOTICIAS RECIENTES QUE PODRÍAN EXPLICAR ESTE MOVIMIENTO:</div>`;
        newsH += `<ul class="weekly-news-list">`;
        data.news.forEach(n => {
          const date = n.publishedAt ? new Date(n.publishedAt).toLocaleDateString('es-ES') : '';
          newsH += `<li><a href="${n.link}" target="_blank" rel="noopener">${n.title}</a><span class="news-meta">${n.publisher} ${date ? '· ' + date : ''}</span></li>`;
        });
        newsH += `</ul></div></div>`;
        $('weekly-alert').innerHTML = newsH;
      }
    }).catch(()=>{});
  }
}

function renderScore(s){
  const circ=2*Math.PI*48;const off=circ-(s.alphaScore/10)*circ;
  const fg=$('score-fg');fg.style.strokeDasharray=circ;fg.style.strokeDashoffset=circ;
  fg.setAttribute('class','score-circle-fg '+(s.alphaScore>=7?'green':s.alphaScore>=4?'gold':'red'));
  setTimeout(()=>{fg.style.strokeDashoffset=off;},200);
  $('score-value').textContent=s.alphaScore.toFixed(1);
  $('score-value').style.color=s.alphaScore>=7.5?'var(--accent)':s.alphaScore>=4?'var(--gold)':'var(--red)';
  const vb=$('r-verdict');vb.textContent=s.verdict;
  const vm={'STRONG BUY':'verdict-strongbuy','BUY':'verdict-buy','HOLD':'verdict-hold','SELL':'verdict-sell','STRONG SELL':'verdict-strongsell'};
  vb.className='verdict-badge '+(vm[s.verdict]||'verdict-hold');
  sBar('bar-biz',s.bizQuality);sBar('bar-moat',s.moatScore);sBar('bar-val',s.valuation);
  sBar('bar-health',s.healthScore);sBar('bar-momentum',s.momentum);
  const wr=$('score-weights-row');
  if(wr) wr.textContent=`Ponderaciones: ${Object.values(SCORE_WEIGHTS).map(w=>`${w.label} ${(w.weight*100).toFixed(0)}%`).join(' · ')}`;
}

// Removed renderPositionSizing

function renderThesis(t, ps){
  const el=$('r-thesis');
  el.innerHTML=`<div class="thesis-paragraph"><div class="thesis-paragraph-text">${t.thesisText}</div></div>`;

  // 4.1: Structured Decision Panel
  const dp=$('r-decision-panel');
  if(!dp)return;
  const d=t.decision;
  const borderC=d.actionEmoji==='📈'||d.actionEmoji==='🟢'?'var(--accent)':d.actionEmoji==='🔴'?'var(--red)':'var(--gold)';
  dp.innerHTML=`<div style="border:1px solid ${borderC};border-radius:12px;padding:20px;background:rgba(0,0,0,0.2);">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">DECISIÓN DE INVERSIÓN</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div><div style="font-size:11px;color:var(--text-muted);">ACCIÓN RECOMENDADA</div><div style="font-size:20px;font-weight:700;color:${borderC}">${d.actionEmoji} ${d.actionLabel}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">TAMAÑO POSICIÓN & CONVICCIÓN</div><div style="font-size:20px;font-weight:700;">${d.positionRange} cartera</div><div style="font-size:12px;color:var(--text-secondary);">${ps ? ps.emoji + ' ' + ps.category : ''}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">HORIZONTE</div><div style="font-size:16px;">${d.horizon}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">ESTRATEGIA</div><div style="font-size:16px;">${d.strategy}</div></div>
    </div>
  </div>
  <div class="entry-price-card" style="margin-top:16px;">
    <div>
      <div class="entry-price-label">Suggested Entry Price</div>
      <div class="entry-price-value">$${t.entryPrice != null ? t.entryPrice.toFixed(2) : 'N/A'}</div>
    </div>
    <div class="entry-price-detail">${t.priceJustification}</div>
  </div>`;
}

// --- v3.0 New Render Functions ---
function renderEarningsQuality(eq) {
  const el = $('r-earnings-quality'); if (!el) return;
  if (!eq || eq.cashConversion == null) { el.innerHTML = ''; return; }
  const fmtLN = v => v != null ? (Math.abs(v) >= 1e9 ? (v/1e9).toFixed(1)+'B' : (v/1e6).toFixed(0)+'M') : 'N/A';
  el.innerHTML = `<div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:12px;">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">CALIDAD DE EARNINGS (1.3)</div>
    <div class="analyst-grid">
      <div class="analyst-stat-card"><div class="analyst-stat-label">Cash Conversion (FCF/NI)</div>
        <div class="analyst-stat-value" style="color:${eq.grade==='alta'?'var(--accent)':eq.grade==='baja'?'var(--red)':'var(--gold)'}">
          ${eq.emoji} ${eq.cashConversion != null ? (eq.cashConversion*100).toFixed(0)+'%' : 'N/A'}</div>
        <div class="analyst-stat-sub">Calidad ${eq.grade}</div></div>
      <div class="analyst-stat-card"><div class="analyst-stat-label">Accruals Ratio</div>
        <div class="analyst-stat-value">${eq.accrualsRatio != null ? (eq.accrualsRatio*100).toFixed(1)+'%' : 'N/A'}</div>
        <div class="analyst-stat-sub">${eq.accrualsRatio != null && eq.accrualsRatio < 0.05 ? '✓ Bajo (bueno)' : '⚠ Elevado'}</div></div>
    </div></div>`;
}

function renderLifecycle(lc) {
  const el = $('r-lifecycle'); if (!el) return;
  const c = lc.phase <= 2 ? 'var(--accent)' : lc.phase === 3 ? 'var(--gold)' : 'var(--red)';
  el.innerHTML = `<div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:12px;">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">CICLO DE VIDA DEL NEGOCIO (2.3)</div>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <span style="font-size:28px;">${lc.emoji}</span>
      <div><div style="font-size:16px;font-weight:700;color:${c}">Fase ${lc.phase} — ${lc.label}</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${lc.desc}</div></div>
    </div></div>`;
}

function renderMeanReversion(mr) {
  const el = $('r-mean-reversion'); if (!el) return;
  if (mr.score == null) { el.innerHTML = ''; return; }
  const c = mr.score >= 7 ? 'var(--red)' : mr.score <= 3 ? 'var(--accent)' : 'var(--gold)';
  const w = (mr.score / 10 * 100);
  el.innerHTML = `<div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:12px;">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">MEAN REVERSION SCORE (2.4)</div>
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="flex:1;">
        <div class="score-bar-track"><div class="score-bar-fill" style="width:${w}%;background:${c};transition:width 0.8s ease;"></div></div>
      </div>
      <span style="font-size:18px;font-weight:700;color:${c}">${mr.score}/10</span>
      <span style="font-size:13px;color:var(--text-secondary)">Prob. reversión: ${mr.label}</span>
    </div>
    <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">${mr.desc}</div></div>`;
}

// Removed renderEarningsRevisions

function renderDCF(dcf, price) {
  const el = $('r-dcf-content'); if (!el) return;
  if (!dcf || !dcf.available) { el.innerHTML = '<p style="color:var(--text-muted)">DCF no disponible — se requiere FCF positivo para el cálculo.</p>'; return; }
  const fmtP = v => '$' + v.toFixed(2);
  const uC = dcf.upside >= 0 ? 'var(--accent)' : 'var(--red)';
  let h = `<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>Escenario</th><th>Prob.</th><th>Crec. Revenue</th><th>Ajuste Margen</th><th>Valor / Acción</th></tr></thead><tbody>`;
  h += `<tr><td>🐻 ${dcf.bear.label}</td><td>${(dcf.bear.prob*100).toFixed(1)}%</td><td>${(dcf.bear.growthRate*100).toFixed(0)}%</td><td>${(dcf.bear.marginAdj*100).toFixed(0)}pp</td><td>${fmtP(dcf.bear.value)}</td></tr>`;
  h += `<tr><td>📊 ${dcf.base.label}</td><td>${(dcf.base.prob*100).toFixed(1)}%</td><td>${(dcf.base.growthRate*100).toFixed(0)}%</td><td>0pp</td><td>${fmtP(dcf.base.value)}</td></tr>`;
  h += `<tr><td>🚀 ${dcf.bull.label}</td><td>${(dcf.bull.prob*100).toFixed(1)}%</td><td>${(dcf.bull.growthRate*100).toFixed(0)}%</td><td>+${(dcf.bull.marginAdj*100).toFixed(0)}pp</td><td>${fmtP(dcf.bull.value)}</td></tr>`;
  h += `<tr style="font-weight:700;border-top:2px solid rgba(255,255,255,0.1);"><td>Valor Ponderado</td><td></td><td></td><td></td><td style="color:${uC}">${fmtP(dcf.weighted)} <span style="font-size:13px;margin-left:8px;font-weight:400">(${dcf.upside>=0?'+':''}${(dcf.upside*100).toFixed(1)}% upside)</span></td></tr>`;
  h += `</tbody></table></div>`;
  el.innerHTML = h;
}

function buildValRow(name,cur,a5y,sa,hd,sd,fn,hib,isNetCash){
  const f=v=>v!=null?fn(v):'N/A';
  const dc=(d,h)=>{if(d==null)return'val-neutral';if(h)return d>0.02?'val-positive':d<-0.02?'val-negative':'val-neutral';return d<-0.02?'val-positive':d>0.02?'val-negative':'val-neutral';};
  const dl=hib?deviationLabelROIC:deviationLabel;
  // ERROR 3: Net Cash gets green styling
  const curStyle=isNetCash?' style="color:var(--accent);font-weight:600"':'';
  return`<tr><td class="metric-name">${name}</td><td${curStyle}>${f(cur)}</td><td>${a5y!=null?f(a5y):'—'}</td><td>${f(sa)}</td><td class="${dc(hd,hib)}">${hd!=null?dl(hd):'—'}</td><td class="${dc(sd,hib)}">${sd!=null?dl(sd):'—'}</td></tr>`;
}
function sBar(id,score){const b=$(id);if(!b)return;b.style.width='0%';b.style.background=score>=7?'var(--accent)':score>=4?'var(--gold)':'var(--red)';b.parentElement.nextElementSibling.textContent=score;setTimeout(()=>{b.style.width=(score/10*100)+'%';},400);}
function avgDev(ds){const v=ds.filter(d=>d!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;}
function showError(m){errorEl.textContent=m;errorEl.classList.add('show');}
function hideError(){errorEl.classList.remove('show');}

// Risk title translator EN→ES
const RISK_DICT = {
  'disruption':'disrupción','regulatory':'regulatoria','pressure':'presión','competition':'competencia',
  'risk':'riesgo','volatility':'volatilidad','decline':'declive','inflation':'inflación',
  'uncertainty':'incertidumbre','constraints':'restricciones','recession':'recesión',
  'headwinds':'vientos en contra','litigation':'litigios','integration':'integración',
  'cyclicality':'ciclicidad','spending':'gasto','compression':'compresión',
  'market':'mercado','impact':'impacto','cost':'coste','fee':'comisión','fees':'comisiones',
  'pricing':'fijación de precios','downturn':'recesión','losses':'pérdidas',
  'capital':'capital','requirements':'requisitos','growth':'crecimiento',
  'slowdown':'desaceleración','changes':'cambios','sensitivity':'sensibilidad',
  'exposure':'exposición','alternatives':'alternativas','cuts':'recortes',
  'patent cliff':'vencimiento de patentes','pipeline':'pipeline',
  'antitrust':'antimonopolio','intense':'intensa','emerging':'emergentes',
  'from':'de','on':'sobre','in':'en','of':'de','and':'y','for':'para',
  'Fintech':'Fintech','AI':'IA','GLP-1':'GLP-1'
};
function translateRisk(text) {
  return text.replace(/\b[A-Za-z-]+\b/g, w => {
    const lower = w.toLowerCase();
    if (RISK_DICT[lower]) return RISK_DICT[lower];
    if (RISK_DICT[w]) return RISK_DICT[w];
    return w;
  }).replace(/^./, c => c.toUpperCase());
}

// --- Section 7: News & Sentiment ---
function renderNews(ticker) {
  const el = $('r-news-content');
  el.innerHTML = '<p style="color:var(--text-muted)">Buscando noticias recientes...</p>';

  fetch(`/api/news/${ticker}`).then(r => r.json()).then(data => {
    if (!data.news || data.news.length === 0) {
      el.innerHTML = '<p style="color:var(--text-muted)">No se encontraron noticias recientes para esta empresa.</p>';
      return;
    }
    const top3 = data.news.slice(0, 3);
    let h = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;">Fuentes en inglés — análisis de sentimiento automático por palabras clave.</div>';
    h += '<div class="news-sentiment-list">';
    top3.forEach(n => {
      const sentiment = analyzeSentiment(n.title);
      const sentColor = sentiment === 'Positivo' ? 'var(--accent)' : sentiment === 'Negativo' ? 'var(--red)' : 'var(--gold)';
      const sentIcon = sentiment === 'Positivo' ? '🟢' : sentiment === 'Negativo' ? '🔴' : '🟡';
      const date = n.publishedAt ? new Date(n.publishedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      h += `<div class="news-sent-card">
        <div class="news-sent-header">
          <span class="news-sent-badge" style="color:${sentColor}">${sentIcon} ${sentiment}</span>
          <span class="news-sent-meta">${n.publisher || ''} ${date ? '· ' + date : ''}</span>
        </div>
        <a href="${n.link}" target="_blank" rel="noopener" class="news-sent-title">${n.title}</a>
      </div>`;
    });
    h += '</div>';
    el.innerHTML = h;
  }).catch(() => {
    el.innerHTML = '<p style="color:var(--text-muted)">No se pudieron cargar las noticias.</p>';
  });
}

function analyzeSentiment(title) {
  if (!title) return 'Neutral';
  const t = title.toLowerCase();
  const pos = ['surge','soar','beat','upgrade','record','growth','strong','gain','rally','rise','boost','profit','outperform','buy','bullish','positive','upbeat','above','exceed','momentum','innovation','breakthrough','deal','partnership','expand'];
  const neg = ['fall','drop','decline','miss','downgrade','cut','loss','sell','crash','weak','warning','risk','lawsuit','layoff','bear','negative','below','concern','fear','slide','slump','plunge','tumble','probe','fine','penalty','delay','fail','recall','fraud'];
  let pScore = 0, nScore = 0;
  pos.forEach(w => { if (t.includes(w)) pScore++; });
  neg.forEach(w => { if (t.includes(w)) nScore++; });
  if (pScore > nScore) return 'Positivo';
  if (nScore > pScore) return 'Negativo';
  return 'Neutral';
}
