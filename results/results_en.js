'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=x=>Number(x)===0?'0':Math.abs(x)<.001?Number(x).toExponential(3):Number(x).toPrecision(5);
const names={original:'Original GPU',startup:'REAL32 initialization',init:'REAL32 initialization',surface:'REAL32 + surface',w:'W boundary',W:'W boundary',cloud:'W + cloud gate'};
function plot(series,xmax,ymax,xlabel,ylabel){
 const W=900,H=270,L=58,R=20,T=18,B=45,x=v=>L+v/xmax*(W-L-R),y=v=>H-B-v/ymax*(H-T-B);
 let html=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ylabel)}"><rect width="${W}" height="${H}" fill="#f8faf3"/>`;
 for(let i=0;i<=4;i++){const yy=ymax*i/4;html+=`<line x1="${L}" x2="${W-R}" y1="${y(yy)}" y2="${y(yy)}" stroke="#dce4d3"/><text x="${L-10}" y="${y(yy)+4}" text-anchor="end" font-size="11" fill="#627359">${yy.toFixed(2)}</text>`;}
 for(const s of series)html+=`<path d="${s.points.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(2)+','+y(p[1]).toFixed(2)).join(' ')}" fill="none" stroke="${s.colour}" stroke-width="2" ${s.dashed?'stroke-dasharray="6 5"':''}/>`;
 return html+`<text x="${L}" y="${H-10}" font-size="11" fill="#627359">0</text><text x="${W-R}" y="${H-10}" text-anchor="end" font-size="11" fill="#627359">${xmax}</text><text x="${W/2}" y="${H-8}" text-anchor="middle" font-size="11" fill="#627359">${esc(xlabel)}</text><text x="${L}" y="12" font-size="10" fill="#627359">${esc(ylabel)}</text></svg>`;
}
async function render(){
 const response=await fetch('./data/results.json',{cache:'no-cache'});if(!response.ok)throw Error('Report unavailable');const data=await response.json();$('snapshot').textContent='Report snapshot: '+data.snapshot_utc;
 const ledger=data.month.completed_period.mass_ledger.filter(r=>['SO2_FCC','SO2_WTE','SO2_KILN'].includes(r.species));
 $('mass-table').innerHTML=ledger.map(r=>'<tr><td>'+esc(r.species)+'</td>'+['emitted_kg','retained_kg','dry_kg','wet_kg','boundary_outflow_kg','residual_kg'].map(k=>'<td>'+number(r[k])+'</td>').join('')+'</tr>').join('');
 const versions=data.month.versions,colors=['#799379','#b49b6c','#ac7668','#638b9b','#5f6d9b'];
 $('rain-chart').innerHTML=plot([...versions.map((v,i)=>({colour:colors[i%5],points:v.rain.d02.map(p=>[p.lead_h,p.rmse])})),{colour:'#a0644b',dashed:true,points:[[0,1],[24,1]]},{colour:'#6c7d57',dashed:true,points:[[0,2],[24,2]]}],24,2.2,'Forecast hour','RAINNC grid RMSE (mm)');
 $('rain-legend').innerHTML=versions.map((v,i)=>`<span><i style="background:${colors[i%5]}"></i>${esc(names[v.key]||v.key)}</span>`).join('');
 $('rain-head').innerHTML='<tr><th>Hour</th>'+versions.map(v=>'<th>'+esc(names[v.key]||v.key)+'</th>').join('')+'</tr>';
 $('rain-body').innerHTML=Array.from({length:25},(_,h)=>'<tr><td>'+h+'</td>'+versions.map(v=>'<td>'+Number(v.rain.d02.find(p=>p.lead_h===h).rmse).toFixed(6)+'</td>').join('')+'</tr>').join('');
 let failures='';for(const v of versions)for(const [domain,d]of Object.entries(v.domains))for(const f of d.failures)for(const detail of f.detail||[])failures+='<tr><td>'+esc(names[v.key]||v.key)+'</td><td>'+esc(domain)+'</td><td>'+esc(f.field)+'</td><td>'+esc(f.lead_h)+'</td><td>'+number(detail.value)+'</td><td>'+number(detail.limit)+'</td></tr>';$('failures').innerHTML=failures;
 $('history-table').innerHTML=Object.entries(data.history.metrics).map(([name,m])=>{const a=m.annual_inventory_prior,g=m.training_inferred_sources;return'<tr><td>'+esc(name)+'</td><td>'+a.n_reports+'</td>'+[a.RMSE_ppb,g.RMSE_ppb,a.MAE_ppb,g.MAE_ppb].map(v=>'<td>'+Number(v).toFixed(3)+'</td>').join('')+'</tr>';}).join('');
 const stations=data.history.stations;$('station').innerHTML=stations.map((s,i)=>'<option value="'+i+'">'+esc(s.city)+' · '+esc(s.id)+'</option>').join('');
 function station(){const r=stations[Number($('station').value)].reports,ymax=Math.max(1,...r.flatMap(p=>[p.observed_ppb,p.A_ppb,p.G_ppb]))*1.08;$('station-chart').innerHTML=plot([{colour:'#496c55',points:r.map((p,i)=>[i,p.observed_ppb])},{colour:'#a0a49c',points:r.map((p,i)=>[i,p.A_ppb])},{colour:'#b68754',points:r.map((p,i)=>[i,p.G_ppb])}],Math.max(1,r.length-1),ymax,'Actual report index','Historical SO₂ (ppb)');}
 $('station').onchange=station;station();window.RESULTS_READY=true;window.RESULTS_DATA=data;
}
render().catch(e=>{console.error(e);$('data-error').hidden=false;});
