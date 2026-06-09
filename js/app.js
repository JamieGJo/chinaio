/* China & the International Order — interactive front-end. Static, descriptive. */
'use strict';
const C = { Defend:'#2E5E8C','Defend-and-Reform':'#6BA3B0', Reform:'#3F8F5B',
            Revisionist:'#B23A48', Accusatory:'#E07A3F', Other:'#C4C0B8' };
const STANCES = ['Defend','Defend-and-Reform','Reform','Revisionist','Accusatory'];
const STANCE_ZH = {Defend:'维护','Defend-and-Reform':'维护兼改革',Reform:'改革',Revisionist:'修正',Accusatory:'指责',Other:'其他'};
const $ = s => document.querySelector(s);
const fmt = n => n.toLocaleString('en-US');
Chart.defaults.font.family = "Inter, sans-serif";
Chart.defaults.color = '#52606e';

const VER = '20260609g';   // bump when data/ is regenerated, to bust browser cache
const J = f => fetch('data/'+f+'?v='+VER).then(r => r.json());
// Stage 1: small files → charts render instantly.
Promise.all(['stats.json','stance_by_year.json','stance_by_month.json','audience_stance.json','us_alienation.json',
  'word_deed.json','unga.json','terms.json','ungdc.json','english.json'].map(J))
.then(([stats, sby, sbm, aud, usal, wd, unga, td, ungdc, en]) => {
  hero(stats); arc(sby, sbm); audience(aud); context(usal); worddeed(wd);
  terms(td); stanceDefs(); ungaSection(unga, ungdc, stats); englishSection(en);
}).catch(e => console.error(e));
// Stage 2: the large article corpus → the explorer, loaded after.
$('#ex-cards').innerHTML = '<p style="color:#9aa3ad;font-family:Inter,sans-serif">Loading the corpus…</p>';
J('articles.json').then(explorer).catch(e => { console.error(e); $('#ex-cards').innerHTML =
  '<p style="color:#888">Articles could not load. If viewing locally, run a local server (e.g. <code>python3 -m http.server</code>).</p>'; });

/* ---------- hero ---------- */
function hero(s){
  $('#s-articles').textContent = fmt(s.n_articles);
  $('#s-usgap').textContent = `${s.us_accusatory_pct}% vs ${s.gs_accusatory_pct}%`;
  $('#s-rev').textContent = `${Math.round(s.rev_pre2005)}% → ${Math.round(s.rev_2018plus)}%`;
  if(s.modal_stance_since2013){
    $('#s-modal').textContent = s.modal_stance_since2013.toLowerCase();
    $('#s-modal-lbl').textContent = `the most common coded stance since 2013 (${s.modal_stance_since2013_pct}% of coded articles)`;
  }
  const rw = document.getElementById('ru-west');
  if(rw && s.west_accusatory_pct!=null) rw.textContent = `${s.west_accusatory_pct}%`;
  $('#s-updated').textContent = s.updated; $('#ft-updated').textContent = s.updated;
  $('#ab-n').textContent = fmt(s.n_articles);
}

/* ---------- legend builder ---------- */
function legend(el, items){
  el.innerHTML = items.map(s =>
    `<div class="it"><div class="dot" style="background:${C[s]}"></div>${s} <span class="zh" style="color:#9aa3ad">${STANCE_ZH[s]}</span></div>`).join('');
}

/* ---------- arc chart ---------- */
let arcChart, arcMode='count', arcData, arcMonthly;
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ARC_NOTE_YEAR = 'People\'s Daily articles containing 国际秩序, by year (1990–2025 shown). "Other" = on-topic but no clear stance. Coding by a validated language model (agreement with human coders κ≈0.68–0.79). <b>Click a year</b> to filter the explorer.';
const ARC_NOTE_MONTH = 'Stance composition by calendar month, pooling all years (share of stance-coded articles; "Other" excluded). Shows seasonality — e.g. whether certain stances cluster around set-piece months. Not clickable.';
function arc(sby, sbm){
  arcData = sby.filter(d => d.year>=1990 && d.year<=2025);
  arcMonthly = sbm || [];
  legend($('#arc-legend'), [...STANCES,'Other']);
  buildArc('count');
  $('#arc-toggle').addEventListener('click', e=>{ const b=e.target.closest('button'); if(!b)return;
    [...e.currentTarget.children].forEach(x=>x.classList.toggle('on',x===b));
    buildArc(b.dataset.mode); });
}
function arcSeries(mode){
  const isMonth = mode==='month';
  const rows = isMonth ? arcMonthly : arcData;
  const set = [...STANCES,'Other'], isPct = mode!=='count';
  return set.map(s=>{
    const data = rows.map(d=>{
      if(mode==='count') return d[s];
      const base = STANCES.reduce((a,k)=>a+d[k],0); // share of substantive stances
      return s==='Other'? 0 : (base? d[s]/base*100 : 0);
    });
    const ds = { label:s, data, stack:'a' };
    if(mode==='area'){ Object.assign(ds, {type:'line', backgroundColor:C[s], borderColor:'#fff', borderWidth:.6, fill:true, pointRadius:0, tension:.25}); }
    else { Object.assign(ds, {type:'bar', backgroundColor:C[s], borderWidth:0}); }
    return ds;
  }).filter(ds=> !(isPct && ds.label==='Other'));
}
function buildArc(mode){
  arcMode = mode;
  const isMonth = mode==='month';
  const isPct = mode!=='count', isArea = mode==='area';
  const rows = isMonth ? arcMonthly : arcData;
  const labels = isMonth ? MONTHS : rows.map(d=>d.year);
  const note = document.getElementById('arc-note'); if(note) note.innerHTML = isMonth ? ARC_NOTE_MONTH : ARC_NOTE_YEAR;
  if(arcChart) arcChart.destroy();
  arcChart = new Chart($('#arc-chart').getContext('2d'), {
    type: isArea?'line':'bar',
    data:{ labels, datasets:arcSeries(mode) },
    options:{ responsive:true, maintainAspectRatio:false,
      interaction: isArea?{mode:'index',intersect:false}:{intersect:true},
      onClick:(e,els)=>{ if(!isMonth && els.length){ setFilter({y:String(arcData[els[0].index].year)});} },
      plugins:{ legend:{display:false},
        tooltip:{ callbacks:{ label:c=> isPct? `${c.dataset.label}: ${c.raw.toFixed(0)}%` : `${c.dataset.label}: ${c.raw}` } } },
      scales:{ x:{stacked:true, grid:{display:false}, ticks:{maxRotation:0, autoSkip:true}},
        y:{ stacked:true, beginAtZero:true, max:isPct?100:undefined,
            title:{display:true, text: isPct?(isMonth?'Share of stance-coded (%), by month':'Share of stance-coded (%)'):'Article count'} } } } });
}

/* ---------- audience bars ---------- */
function audience(aud){
  legend($('#aud-legend'), STANCES);
  const rows = aud.by_audience.map(r=>({...r, reformish:(r.Reform+r['Defend-and-Reform'])/r.n}))
    .sort((a,b)=> b.reformish - a.reformish);
  const short = {'Global South minilaterals':'Global South','UN / multilateral system':'UN / multilateral',
    'Domestic (Party/governance)':'Domestic (Party)','Western allies':'Western allies','United States':'United States',
    'Taiwan / sovereignty':'Taiwan','Great-power theory':'Great-power theory','Other bilateral':'Other bilateral',
    'General (unspecified)':'General'};
  $('#aud-bars').innerHTML = rows.map(r=>{
    const segs = STANCES.map(s=>{ const pct=r[s]/r.n*100; return pct>0?
      `<span class="c-${s.replace(/ /g,'')}" title="${s}: ${pct.toFixed(0)}%" style="width:${pct}%;background:${C[s]}"></span>`:''; }).join('');
    return `<div class="audrow" data-aud="${r.audience}">
      <div class="audname">${short[r.audience]||r.audience} <small>n=${r.n}</small></div>
      <div class="audbar">${segs}</div></div>`;
  }).join('');
  $('#aud-bars').querySelectorAll('.audrow').forEach(el=>
    el.addEventListener('click',()=>setFilter({a:el.dataset.aud})));
  const ru = aud.russia_ukraine;
  if(ru){ $('#ru-pre').textContent = Math.round(ru['pre-2022'].Accusatory)+'%';
          $('#ru-post').textContent = Math.round(ru['2022+'].Accusatory)+'%'; }
}

/* ---------- context chart (US isolation + IO volume) ---------- */
function context(usal){
  const ctx=$('#context-chart').getContext('2d');
  const ptColor = usal.map(d=> d.reliable? '#B23A48':'#fff');
  new Chart(ctx,{ data:{ labels:usal.map(d=>d.year), datasets:[
    { type:'line', label:'US isolation at the UN', yAxisID:'y', data:usal.map(d=>d.alienation),
      borderColor:'#B23A48', backgroundColor:'#B23A48', borderWidth:2.4, tension:.2,
      pointBackgroundColor:ptColor, pointBorderColor:'#B23A48', pointRadius:3.5, pointHoverRadius:5, order:1 },
    { type:'bar', label:'PD order-articles / yr', yAxisID:'y1', data:usal.map(d=>d.io_articles),
      backgroundColor:'rgba(34,48,74,.16)', borderWidth:0, order:2 } ]},
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{ legend:{position:'top', labels:{boxWidth:14,padding:14}} },
      scales:{ x:{grid:{display:false}, ticks:{maxRotation:0,autoSkip:true}},
        y:{position:'left', title:{display:true,text:'World distance from US (isolation)'}, grid:{color:'#eee'}},
        y1:{position:'right', title:{display:true,text:'PD articles / yr'}, grid:{display:false}, beginAtZero:true} } } });
}

/* ---------- word vs deed (aggregate or any single behaviour vs revisionist words) ---------- */
let wdChart, wdSel='aggregate', wdData;
function worddeed(wd){
  wdData = wd;
  const opts = [{key:'aggregate', label:'Aggregate index'}, ...wd.components];
  $('#wd-toggle').innerHTML = opts.map(o=>`<button data-k="${o.key}" class="${o.key==='aggregate'?'on':''}">${o.label}</button>`).join('');
  $('#wd-toggle').addEventListener('click', e=>{ const b=e.target.closest('button'); if(!b) return;
    [...e.currentTarget.children].forEach(x=>x.classList.toggle('on',x===b));
    wdSel=b.dataset.k; buildWd(); });
  buildWd();
}
function buildWd(){
  const S=wdData.series, isAgg=wdSel==='aggregate';
  const comp = wdData.components.find(c=>c.key===wdSel);
  const label = isAgg ? 'Parallel-building (aggregate, deeds)' : comp.label+' (deed)';
  const behData = S.map(d=> isAgg ? d.parallel_build : d[wdSel]);
  const rawData = S.map(d=> isAgg ? null : d[wdSel+'_raw']);
  if(wdChart) wdChart.destroy();
  wdChart = new Chart($('#wd-chart').getContext('2d'),{ data:{ labels:S.map(d=>d.year), datasets:[
    { type:'line', label, yAxisID:'y', data:behData,
      borderColor:'#C8902A', backgroundColor:'#C8902A', borderWidth:2.6, tension:.25, pointRadius:0, spanGaps:true },
    { type:'line', label:'Calls to replace the order (words)', yAxisID:'y1', data:S.map(d=>d.revisionist_pct),
      borderColor:'#B23A48', backgroundColor:'#B23A48', borderWidth:2.6, borderDash:[5,3], tension:.25, pointRadius:0, spanGaps:true } ]},
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{ legend:{position:'top', labels:{boxWidth:14,padding:14}},
        tooltip:{ callbacks:{ label:c=>{
          if(c.dataset.yAxisID==='y1') return `Revisionist share: ${c.raw}%`;
          const raw=rawData[c.dataIndex];
          return raw!=null ? `${label}: ${raw} (index ${c.raw})` : `${label}: index ${c.raw}`;
        }}}},
      scales:{ x:{grid:{display:false}, ticks:{maxRotation:0,autoSkip:true}},
        y:{position:'left', min:0, max:100, title:{display:true,text: isAgg?'Parallel-build index (0–100)':'Normalised level (0–100)'}, grid:{color:'#eee'}},
        y1:{position:'right', title:{display:true,text:'Revisionist share (%)'}, beginAtZero:true, grid:{display:false},
            suggestedMax:15} } } });
}

/* ---------- explorer ---------- */
let ALL=[], PAGE=24, shown=0, pendingFilter=null;
function explorer(articles){
  ALL = articles;
  const uniq = (k)=>[...new Set(articles.map(a=>a[k]).filter(x=>x&&x!=='—'))];
  fill('#f-src', ["People's Daily (Chinese)","People's Daily English","China Daily"]);
  fill('#f-stance', [...STANCES,'Other']);
  fill('#f-aud', uniq('a').sort());
  fill('#f-dom', uniq('dm').sort());
  fill('#f-year', uniq('y').sort((a,b)=>b-a));
  ['#f-src','#f-stance','#f-aud','#f-dom','#f-year'].forEach(s=>$(s).addEventListener('change',()=>render(true)));
  $('#f-q').addEventListener('input', debounce(()=>render(true),180));
  $('#f-reset').addEventListener('click',()=>{ ['#f-src','#f-stance','#f-aud','#f-dom','#f-year','#f-q'].forEach(s=>$(s).value=''); render(true); });
  $('#ex-more').addEventListener('click',()=>render(false));
  if(pendingFilter){ const p=pendingFilter; pendingFilter=null; setFilter(p); } else render(true);
}
function fill(sel, vals){ const el=$(sel); vals.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; el.appendChild(o); }); }
function debounce(fn,ms){ let t; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a),ms);}; }
function current(){
  const fsrc=$('#f-src').value, fs=$('#f-stance').value, fa=$('#f-aud').value, fd=$('#f-dom').value, fy=$('#f-year').value,
        q=$('#f-q').value.trim().toLowerCase();
  const srcOf = a => a.src || "People's Daily (Chinese)";
  return ALL.filter(a=>
    (!fsrc || srcOf(a)===fsrc) && (!fs || a.s===fs) && (!fa || a.a===fa) && (!fd || a.dm===fd) && (!fy || String(a.y)===fy) &&
    (!q || (a.h&&a.h.toLowerCase().includes(q)) || (a.q&&a.q.toLowerCase().includes(q)) || (a.r&&a.r.toLowerCase().includes(q))));
}
function render(reset){
  const res = current();
  if(reset){ shown=0; $('#ex-cards').innerHTML=''; }
  const slice = res.slice(shown, shown+PAGE); shown += slice.length;
  $('#ex-cards').insertAdjacentHTML('beforeend', slice.map(card).join(''));
  $('#ex-count').textContent = `${fmt(res.length)} article${res.length===1?'':'s'}`;
  $('#ex-more').style.display = shown < res.length ? 'block' : 'none';
  $('#ex-cards').querySelectorAll('.why-btn').forEach(b=> b.onclick=()=>{ const w=b.closest('.acard').querySelector('.why'); w.classList.toggle('open'); b.textContent = w.classList.contains('open')?'Hide reasoning':'Why this code?'; });
  $('#ex-cards').querySelectorAll('.en-btn').forEach(b=> b.onclick=()=>{ const w=b.closest('.acard').querySelector('.en'); w.classList.toggle('open'); b.textContent = w.classList.contains('open')?'Hide English':'English'; });
}
function esc(s){ return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function card(a){
  const sc = a.s.replace(/ /g,'');
  const val = (a.v===null||a.v===undefined)?'':` · valence ${a.v>0?'+':''}${a.v}`;
  const hasEn = a.he || a.qe;
  const isZh = !a.src;   // Chinese PD has no src; English sources carry one
  const searchQ = isZh ? `"${a.h}" 人民日报` : `"${a.h}" ${a.src}`;
  return `<div class="acard">
    <div class="top"><span class="chip c-${sc}">${a.s}</span>
      ${a.src?`<span class="srctag">${a.src}</span>`:''}
      ${a.a&&a.a!=='—'?`<span class="tags"><b>${a.a}</b></span>`:''}
      <span class="date">${a.d}</span></div>
    <h4>${esc(a.h)||'<span style=color:#aaa>(no headline)</span>'}</h4>
    ${a.q?`<div class="quote${isZh?' zh':''}">${esc(a.q)}</div>`:''}
    ${hasEn?`<div class="en">${a.he?`<div class="en-h">${esc(a.he)}</div>`:''}${a.qe?`<div class="en-q">"${esc(a.qe)}"</div>`:''}</div>`:''}
    <div class="tags">${a.dm&&a.dm!=='—'?`theme: <b>${a.dm}</b>`:''}${a.t?` · ${a.t}${val}`:''}${a.sec?` · ${a.sec}`:''}</div>
    ${a.r?`<div class="why">${esc(a.r)}</div>`:''}
    <div class="actions">${hasEn?'<button class="en-btn">English</button>':''}${a.r?'<button class="why-btn">Why this code?</button>':''}${a.u?`<a href="${a.u}" target="_blank" rel="noopener" title="Open the article">Source ↗</a>`:''}${a.h?`<a href="https://www.google.com/search?q=${encodeURIComponent(searchQ)}" target="_blank" rel="noopener" title="Find on the open web">Search web ↗</a>`:''}</div>
  </div>`;
}
window.setFilter = function(obj){
  if(!ALL.length){ pendingFilter=obj; document.getElementById('explorer').scrollIntoView({behavior:'smooth'}); return; }
  if('s' in obj) $('#f-stance').value=obj.s;
  if('a' in obj) $('#f-aud').value=obj.a;
  if('dm' in obj) $('#f-dom').value=obj.dm;
  if('y' in obj) $('#f-year').value=obj.y;
  render(true);
  document.getElementById('explorer').scrollIntoView({behavior:'smooth'});
};

/* ---------- combined term chart (selectable) ---------- */
const TERM_COLORS = {io:'#22304a', csf:'#3F8F5B', ntr:'#2E5E8C', gc:'#6BA3B0', pwo:'#B23A48', isys:'#C8902A'};
let termData, termChart, termVis;
function terms(td){
  termData = td;
  termVis = Object.fromEntries(td.terms.map(t=>[t.key, true]));
  $('#term-legend').innerHTML = td.terms.map(t=>
    `<div class="it term-it" data-k="${t.key}" style="cursor:pointer;user-select:none">
       <div class="dot" style="background:${TERM_COLORS[t.key]}"></div><span class="zh">${t.zh}</span>
       <span style="color:#9aa3ad;font-size:.78rem">${t.en}</span></div>`).join('');
  $('#term-legend').querySelectorAll('.term-it').forEach(el=> el.addEventListener('click', ()=>{
    termVis[el.dataset.k] = !termVis[el.dataset.k];
    el.style.opacity = termVis[el.dataset.k] ? '1' : '.38';
    buildTerms();
  }));
  buildTerms();
  termDefs(td);
}
function buildTerms(){
  const td=termData;
  const ds = td.terms.filter(t=>termVis[t.key]).map(t=>({
    label:`${t.zh} ${t.en}`, data:td.series[t.key].map(d=>d.n),
    borderColor:TERM_COLORS[t.key], backgroundColor:TERM_COLORS[t.key],
    borderWidth:2.2, tension:.25, pointRadius:0, spanGaps:true }));
  if(termChart) termChart.destroy();
  termChart = new Chart($('#term-chart').getContext('2d'), { type:'line',
    data:{ labels:td.years, datasets:ds },
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>`${c.dataset.label}: ${c.raw}` } } },
      scales:{ x:{grid:{display:false}, ticks:{maxRotation:0,autoSkip:true}},
        y:{beginAtZero:true, title:{display:true, text:'Articles per year'}} } } });
}

/* ---------- term backgrounds (web-sourced, descriptive) ---------- */
const TERM_BG = {
  io:  'The general term for the rules, institutions and norms governing relations between states — the central object this site tracks. In official Chinese usage it is typically paired with calls to make the order "more just and reasonable" and to give developing countries a greater voice. (Wang Yi, People\'s Daily, Dec 2017.)',
  csf: 'Xi Jinping\'s signature foreign-policy concept, first put to an international audience in March 2013 (Moscow), with roots in a 2007 Hu Jintao phrase. It frames nations\' futures as interlinked and calls for cooperation on peace, development and security. The official English shifted from "shared destiny" to "shared future" after Xi\'s 2015 UN speech; it was written into the CPC Constitution (Oct 2017) and the PRC Constitution (March 2018). Peaks here in 2018.',
  ntr: 'A slogan for great-power relations "based on mutual respect, fairness and justice, and win-win cooperation", explicitly rejecting zero-sum competition. First floated in 2010 and set out by Xi in his March 2013 Moscow speech. An early-Xi formulation that peaks around 2018 and then recedes.',
  gc:  'An era-framing phrase Xi used from October 2017 — "great changes unseen in a century" — for a perceived global power shift, invoking the upheavals of a century earlier (the First World War, the fall of empires, the rise of new powers). It now opens China\'s foreign- and defence-policy white papers. Peaks here in 2021, through the trade-war and COVID years.',
  pwo: 'The order established by the victors of the Second World War, centred on the UN and the UN Charter. Chinese official discourse presents China as a contributor to and beneficiary of this order, "to be safeguarded and improved", and often contrasts it with what Beijing calls the Western "rules-based" order. An institutional-defensive term that reaches a new high in 2025.',
  isys:'Closely paired with "international order" in Chinese usage — officials speak of "the international system centred on the UN and the international order based on international law". (English-language scholarship distinguishes the system — states and their interactions — from the order — the rules; Chinese discourse tends to use the two together.) Also reaches a new high in 2025.',
};
function termDefs(td){
  $('#term-defs').innerHTML = td.terms.map(t=>
    `<details><summary><span class="termname">${t.zh}</span> <span class="sans" style="font-weight:400;color:#6B7280;font-size:.82rem">${t.en}</span></summary><div class="body">${TERM_BG[t.key]||''}</div></details>`).join('');
}

/* ---------- stance definitions ---------- */
function stanceDefs(){
  const D=[
   ['Defend','维护',C.Defend,'Defends the existing order against challenge — typically by treating the current order as legitimate and worth preserving.'],
   ['Reform','改革',C.Reform,'Calls for gradual change <em>within</em> the order — more voice for the Global South, more equitable economic governance — without advocating replacement.'],
   ['Defend-and-Reform','维护兼改革',C['Defend-and-Reform'],'Both defends the order and calls for reform within it — common in longer texts that acknowledge flaws while rejecting wholesale replacement.'],
   ['Revisionist','修正',C.Revisionist,'Advocates overturning or replacing the order with an alternative system — e.g. explicitly calling for a "new order".'],
   ['Accusatory','指责',C.Accusatory,'Names a third party — most often the United States — as undermining the order. Distinct from China advocating change itself.'],
  ];
  $('#stance-defs').innerHTML = D.map(([en,zh,col,body])=>
    `<details><summary><span class="chip c-${en.replace(/ /g,'')}">${en}</span> <span style="color:${col}">${zh}</span></summary><div class="body">${body}</div></details>`).join('');
}

/* ---------- UNGA (cross-national + domestic comparison) ---------- */
function ungaSection(unga, ungdc, stats){
  if(unga.summary) $('#unga-lead').innerHTML = unga.summary +
    ` Across People's Daily 2010–2025, the Revisionist share averages <b>${unga.pd_revisionist_mean}%</b>; in these UN speeches it is zero.`;

  // Analysis intro (data-driven)
  const revYrs = (ungdc.china_rev_years||[]).join(', ');
  $('#unga-intro').innerHTML =
    `Reading every state's UN General Assembly general-debate speech with the same five-stance scheme places China in cross-national context. China has spoken in ${ungdc.n_china} of those debates between ${ungdc.year_min} and ${ungdc.year_max}. ` +
    `The podium as a whole is overwhelmingly <b>reformist</b> (Reform ${ungdc.world_dist.Reform}%, genuine Revisionist just ${ungdc.world_dist.Revisionist}% across ${fmt(ungdc.n_world)} speeches by ${ungdc.n_world_countries} states), and China sits in that mainstream (Reform ${ungdc.china_dist.Reform}%). ` +
    `China's only order-replacement speeches fall in the NIEO era (${revYrs}); since then its UN language has been Defend-and-Reform. ` +
    `At home in People's Daily the mix is different — more Defend (${ungdc.pd_dist.Defend}%) and Accusatory (${ungdc.pd_dist.Accusatory}%), less Reform (${ungdc.pd_dist.Reform}%).`;

  // Chart 1 — China at the UN, by decade (stacked %)
  legend($('#ungaDec-legend'), STANCES);
  const dec = ungdc.china_decade;
  new Chart($('#unga-decade-chart').getContext('2d'),{ type:'bar',
    data:{ labels:dec.map(d=>`${d.decade} (n=${d.n})`), datasets: STANCES.map(s=>({
      label:s, data:dec.map(d=>d[s]||0), backgroundColor:C[s], stack:'a', borderWidth:0 })) },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>`${c.dataset.label}: ${c.raw.toFixed(0)}%` } } },
      scales:{ x:{stacked:true, grid:{display:false}, ticks:{maxRotation:0, autoSkip:false, font:{size:9}}},
        y:{stacked:true, beginAtZero:true, max:100, title:{display:true, text:'Share of speeches (%)'}} } } });

  // Chart 2 — China·UN vs World·UN vs China·home (stacked 100% composition)
  legend($('#ungaCmp-legend'), STANCES);
  const groups=[['China · UN', ungdc.china_dist],['All states · UN', ungdc.world_dist],['China · People\'s Daily (home)', ungdc.pd_dist]];
  new Chart($('#unga-compare-chart').getContext('2d'),{ type:'bar',
    data:{ labels:groups.map(g=>g[0]), datasets: STANCES.map(s=>({
      label:s, data:groups.map(g=>g[1][s]||0), backgroundColor:C[s], stack:'a', borderWidth:0 })) },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>`${c.dataset.label}: ${c.raw.toFixed(0)}%` } } },
      scales:{ x:{stacked:true, beginAtZero:true, max:100, title:{display:true, text:'Stance composition (%)'}},
        y:{stacked:true, grid:{display:false}} } } });

  $('#unga-quotes').innerHTML = (unga.years||[]).map(q=>
    `<div class="card" style="padding:1rem 1.2rem">
      <div class="tags" style="font-family:Inter,sans-serif;font-size:.78rem;color:#6B7280">${q.y} · ${q.speaker}</div>
      <p style="font-size:.98rem;margin:.4rem 0 0;color:#33414f">"${q.quote}"</p></div>`).join('');
}

/* ---------- In English (China Daily + PD English vs Chinese) ---------- */
const EN_SRC_COLORS = {pd_zh:'#22304a', pd_en:'#2E5E8C', cd:'#C8902A'};
const EN_SRCS = [['pd_zh',"People's Daily (Chinese)"],['pd_en',"People's Daily English"],['cd',"China Daily"]];
let enData, enTimeChart, enStance='Accusatory', enVis={pd_zh:true, pd_en:true, cd:true};
function englishSection(en){
  enData = en; const d = en.dist;
  $('#english-intro').innerHTML =
    `China's order vocabulary also appears in its English-language outlets, written largely for foreign readers and coded on the same scheme. ` +
    `Both carry almost no overt Revisionist language (People's Daily English ${d.pd_en.Revisionist}%, China Daily ${d.cd.Revisionist}%, against ${d.pd_zh.Revisionist}% in the Chinese edition). ` +
    `China Daily is the most Accusatory (${d.cd.Accusatory}%); People's Daily English leans most to Defend (${d.pd_en.Defend}%).`;

  // composition by source (stacked 100%)
  legend($('#enComp-legend'), STANCES);
  const groups = [["People's Daily (Chinese)", d.pd_zh], ["People's Daily English", d.pd_en],
                  ["China Daily", d.cd], ["China · UN", d.unga]];
  new Chart($('#english-comp-chart').getContext('2d'),{ type:'bar',
    data:{ labels:groups.map(g=>g[0]), datasets: STANCES.map(s=>({
      label:s, data:groups.map(g=>g[1][s]||0), backgroundColor:C[s], stack:'a', borderWidth:0 })) },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>`${c.dataset.label}: ${c.raw.toFixed(0)}%` } } },
      scales:{ x:{stacked:true, beginAtZero:true, max:100, title:{display:true, text:'Stance composition (%)'}},
        y:{stacked:true, grid:{display:false}} } } });

  // stance-over-time toggle
  $('#enStance-toggle').innerHTML = STANCES.map(s=>`<button data-s="${s}" class="${s===enStance?'on':''}">${s}</button>`).join('');
  $('#enStance-toggle').addEventListener('click', e=>{ const b=e.target.closest('button'); if(!b) return;
    [...e.currentTarget.children].forEach(x=>x.classList.toggle('on',x===b)); enStance=b.dataset.s; buildEnTime(); });
  // source toggle — lets readers build their own China Daily vs People's Daily comparison
  $('#enSrc-toggle').innerHTML = EN_SRCS.map(([k,lbl])=>`<button data-k="${k}" class="${enVis[k]?'on':''}">${lbl}</button>`).join('');
  $('#enSrc-toggle').addEventListener('click', e=>{ const b=e.target.closest('button'); if(!b) return;
    enVis[b.dataset.k] = !enVis[b.dataset.k]; b.classList.toggle('on', enVis[b.dataset.k]); buildEnTime(); });
  buildEnTime();
}
function buildEnTime(){
  const en=enData, srcs=EN_SRCS.filter(([k])=>enVis[k]);
  const labels = en.by_year.pd_zh.map(d=>d.year);
  const ds = srcs.map(([k,lbl])=>({ label:lbl, data:en.by_year[k].map(d=>d[enStance]),
    borderColor:EN_SRC_COLORS[k], backgroundColor:EN_SRC_COLORS[k], borderWidth:2.4, tension:.25, pointRadius:0, spanGaps:true }));
  if(enTimeChart) enTimeChart.destroy();
  enTimeChart = new Chart($('#english-time-chart').getContext('2d'),{ type:'line', data:{labels, datasets:ds},
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{ legend:{position:'top', labels:{boxWidth:12, font:{size:10}, padding:8}},
        tooltip:{ callbacks:{ label:c=>`${c.dataset.label}: ${c.raw==null?'—':c.raw+'%'}` } } },
      scales:{ x:{grid:{display:false}, ticks:{maxRotation:0,autoSkip:true}},
        y:{beginAtZero:true, title:{display:true, text:enStance+' share (%)'}} } } });
}
