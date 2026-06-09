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

const J = f => fetch('data/'+f).then(r => r.json());
// Stage 1: small files → charts render instantly.
Promise.all(['stats.json','stance_by_year.json','audience_stance.json','us_alienation.json',
  'word_deed.json','unga.json','term_csf.json','term_gc_ntr.json'].map(J))
.then(([stats, sby, aud, usal, wd, unga, csf, gcntr]) => {
  hero(stats); arc(sby); audience(aud); context(usal); worddeed(wd);
  terms(csf, gcntr); termDefs(); stanceDefs(); ungaSection(unga, stats);
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
  $('#s-updated').textContent = s.updated; $('#ft-updated').textContent = s.updated;
  $('#ab-n').textContent = fmt(s.n_articles);
}

/* ---------- legend builder ---------- */
function legend(el, items){
  el.innerHTML = items.map(s =>
    `<div class="it"><div class="dot" style="background:${C[s]}"></div>${s} <span class="zh" style="color:#9aa3ad">${STANCE_ZH[s]}</span></div>`).join('');
}

/* ---------- arc chart ---------- */
let arcChart, arcMode='count', arcData;
function arc(sby){
  arcData = sby.filter(d => d.year>=1990 && d.year<=2025);
  legend($('#arc-legend'), [...STANCES,'Other']);
  buildArc('count');
  $('#arc-toggle').addEventListener('click', e=>{ const b=e.target.closest('button'); if(!b)return;
    [...e.currentTarget.children].forEach(x=>x.classList.toggle('on',x===b));
    buildArc(b.dataset.mode); });
}
function arcSeries(mode){
  const set = [...STANCES,'Other'], isPct = mode!=='count';
  return set.map(s=>{
    const data = arcData.map(d=>{
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
  const isPct = mode!=='count', isArea = mode==='area';
  if(arcChart) arcChart.destroy();
  arcChart = new Chart($('#arc-chart').getContext('2d'), {
    type: isArea?'line':'bar',
    data:{ labels:arcData.map(d=>d.year), datasets:arcSeries(mode) },
    options:{ responsive:true, maintainAspectRatio:false,
      interaction: isArea?{mode:'index',intersect:false}:{intersect:true},
      onClick:(e,els)=>{ if(els.length){ setFilter({y:String(arcData[els[0].index].year)});} },
      plugins:{ legend:{display:false},
        tooltip:{ callbacks:{ label:c=> isPct? `${c.dataset.label}: ${c.raw.toFixed(0)}%` : `${c.dataset.label}: ${c.raw}` } } },
      scales:{ x:{stacked:true, grid:{display:false}, ticks:{maxRotation:0, autoSkip:true}},
        y:{ stacked:true, beginAtZero:true, max:isPct?100:undefined,
            title:{display:true, text: isPct?'Share of stance-coded (%)':'Article count'} } } } });
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

/* ---------- word vs deed ---------- */
function worddeed(wd){
  const ctx=$('#wd-chart').getContext('2d');
  new Chart(ctx,{ data:{ labels:wd.map(d=>d.year), datasets:[
    { type:'line', label:'Parallel-building (deeds)', yAxisID:'y', data:wd.map(d=>d.parallel_build),
      borderColor:'#C8902A', backgroundColor:'#C8902A', borderWidth:2.6, tension:.25, pointRadius:0, spanGaps:true },
    { type:'line', label:'Calls to replace the order (words)', yAxisID:'y1', data:wd.map(d=>d.revisionist_pct),
      borderColor:'#B23A48', backgroundColor:'#B23A48', borderWidth:2.6, borderDash:[5,3], tension:.25, pointRadius:0, spanGaps:true } ]},
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{ legend:{position:'top', labels:{boxWidth:14,padding:14}} },
      scales:{ x:{grid:{display:false}, ticks:{maxRotation:0,autoSkip:true}},
        y:{position:'left', title:{display:true,text:'Parallel-build index (0–100)'}, grid:{color:'#eee'}},
        y1:{position:'right', title:{display:true,text:'Revisionist share (%)'}, beginAtZero:true, grid:{display:false},
            suggestedMax:15} } } });
}

/* ---------- explorer ---------- */
let ALL=[], PAGE=24, shown=0, pendingFilter=null;
function explorer(articles){
  ALL = articles;
  const uniq = (k)=>[...new Set(articles.map(a=>a[k]).filter(x=>x&&x!=='—'))];
  fill('#f-stance', [...STANCES,'Other']);
  fill('#f-aud', uniq('a').sort());
  fill('#f-dom', uniq('dm').sort());
  fill('#f-year', uniq('y').sort((a,b)=>b-a));
  ['#f-stance','#f-aud','#f-dom','#f-year'].forEach(s=>$(s).addEventListener('change',()=>render(true)));
  $('#f-q').addEventListener('input', debounce(()=>render(true),180));
  $('#f-reset').addEventListener('click',()=>{ ['#f-stance','#f-aud','#f-dom','#f-year','#f-q'].forEach(s=>$(s).value=''); render(true); });
  $('#ex-more').addEventListener('click',()=>render(false));
  if(pendingFilter){ const p=pendingFilter; pendingFilter=null; setFilter(p); } else render(true);
}
function fill(sel, vals){ const el=$(sel); vals.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; el.appendChild(o); }); }
function debounce(fn,ms){ let t; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a),ms);}; }
function current(){
  const fs=$('#f-stance').value, fa=$('#f-aud').value, fd=$('#f-dom').value, fy=$('#f-year').value,
        q=$('#f-q').value.trim().toLowerCase();
  return ALL.filter(a=>
    (!fs || a.s===fs) && (!fa || a.a===fa) && (!fd || a.dm===fd) && (!fy || String(a.y)===fy) &&
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
}
function esc(s){ return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function card(a){
  const sc = a.s.replace(/ /g,'');
  const val = (a.v===null||a.v===undefined)?'':` · valence ${a.v>0?'+':''}${a.v}`;
  return `<div class="acard">
    <div class="top"><span class="chip c-${sc}">${a.s}</span>
      ${a.a&&a.a!=='—'?`<span class="tags"><b>${a.a}</b></span>`:''}
      <span class="date">${a.d}</span></div>
    <h4>${esc(a.h)||'<span style=color:#aaa>(no headline)</span>'}</h4>
    ${a.q?`<div class="quote zh">${esc(a.q)}</div>`:''}
    <div class="tags">${a.dm&&a.dm!=='—'?`theme: <b>${a.dm}</b>`:''}${a.t?` · ${a.t}${val}`:''}${a.sec?` · ${a.sec}`:''}</div>
    ${a.r?`<div class="why">${esc(a.r)}</div>`:''}
    <div class="actions">${a.r?'<button class="why-btn">Why this code?</button>':''}${a.u?`<a href="${a.u}" target="_blank" rel="noopener" title="People's Daily archive (may need a subscription)">Source ↗</a>`:''}${a.h?`<a href="https://www.google.com/search?q=${encodeURIComponent('"'+a.h+'" 人民日报')}" target="_blank" rel="noopener" title="Find on the open web">Search web ↗</a>`:''}</div>
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

/* ---------- term charts ---------- */
function terms(csf, gcntr){
  new Chart($('#csf-chart'),{ type:'bar', data:{ labels:csf.map(d=>d.year),
    datasets:[{ data:csf.map(d=>d.n), backgroundColor:'#3F8F5B', borderWidth:0 }] },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},
      tooltip:{callbacks:{label:c=>`Articles: ${c.raw}`}}},
      scales:{x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true}},y:{beginAtZero:true}}} });
  const years=[...new Set([...gcntr.gc.map(d=>d.year),...gcntr.ntr.map(d=>d.year)])].sort();
  const gm=Object.fromEntries(gcntr.gc.map(d=>[d.year,d.n])), nm=Object.fromEntries(gcntr.ntr.map(d=>[d.year,d.n]));
  new Chart($('#gcntr-chart'),{ type:'bar', data:{ labels:years, datasets:[
    {label:'百年未有之大变局', data:years.map(y=>gm[y]||0), backgroundColor:'#6BA3B0', borderWidth:0},
    {label:'新型国际关系', data:years.map(y=>nm[y]||0), backgroundColor:'#2E5E8C', borderWidth:0} ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:12,font:{size:11}}}},
      scales:{x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true}},y:{beginAtZero:true}}} });
}

/* ---------- term definitions ---------- */
function termDefs(){
  const T=[
   ['国际秩序','International order','The core search term — tracked across the full archive.'],
   ['人类命运共同体','Community of shared future','Xi Jinping\'s signature concept (from ~2013, amplified 2015); a vision of order grounded in shared destiny and multilateral cooperation, referenced in UN resolutions.'],
   ['新型国际关系','New type of international relations','An early-Xi slogan for great-power relations without conflict or confrontation; peaks around 2018 in the data.'],
   ['百年未有之大变局','Great changes unseen in a century','An era-framing term (from ~2017–18): "the most profound changes in a century". Rises through the trade-war and COVID years, peaks 2021.'],
   ['战后国际秩序 / 国际体系','Post-war order / international system','Terms invoking the framework built after 1945; rising in recent years.'],
   ['霸权主义','Hegemonism','One of the oldest critical terms; faded in the Jiang/Hu era, rising again from 2025.'],
  ];
  $('#term-defs').innerHTML = T.map(([zh,en,body])=>
    `<details><summary><span class="termname">${zh}</span> <span class="sans" style="font-weight:400;color:#6B7280;font-size:.82rem">${en}</span></summary><div class="body">${body}</div></details>`).join('');
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

/* ---------- UNGA ---------- */
function ungaSection(unga, stats){
  if(unga.summary) $('#unga-lead').innerHTML = unga.summary +
    ` Across People's Daily 2010–2025, the Revisionist share averages <b>${unga.pd_revisionist_mean}%</b>; in these UN speeches it is zero.`;
  $('#unga-quotes').innerHTML = (unga.years||[]).map(q=>
    `<div class="card" style="padding:1rem 1.2rem">
      <div class="tags" style="font-family:Inter,sans-serif;font-size:.78rem;color:#6B7280">${q.y} · ${q.speaker}</div>
      <p style="font-size:.98rem;margin:.4rem 0 0;color:#33414f">"${q.quote}"</p></div>`).join('');
}
