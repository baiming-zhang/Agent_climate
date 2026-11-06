'use strict';
const $ = id => document.getElementById(id);
const colour = {A:'#b59b77',G:'#49725a',constant:'#a2ada1',observed:'#344e40'};
const seriesColours = ['#728b78','#929577','#bd946f','#537e83','#8d7187'];
const escapeHTML = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (value,digits=6) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const num = value => Number.isFinite(value) ? (Math.abs(value)<.00001&&value!==0?value.toExponential(3):fmt(value,6)) : '—';
const utcStamp=value=>new Date(value).toISOString().slice(0,19).replace('T',' ')+' UTC';
const names = {all:'全部留出',Burrard_15km:'Burrard 15 km',regional:'区域站'};
const modelNames = {annual_inventory_prior:'A · 年库存',training_inferred_sources:'G · 源约束',constant:'训练均值常数'};
function svg(width,height,inside,label){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(label)}"><title>${escapeHTML(label)}</title>${inside}</svg>`;}
function legend(items){return items.map(([label,c])=>`<span><i style="--series-color:${c}"></i>${escapeHTML(label)}</span>`).join('');}
function groupChart(data){
  const width=680,height=310,left=115,right=45,top=18,bottom=42;
  const maximum=Math.ceil(Math.max(...Object.values(data.history.metrics).map(g=>g.annual_inventory_prior.RMSE_ppb))*2)/2;
  const x=v=>left+v/maximum*(width-left-right);let s='';
  for(let i=0;i<=5;i++){const v=maximum*i/5,px=x(v);s+=`<line class="grid" x1="${px}" x2="${px}" y1="${top}" y2="${height-bottom}"/><text x="${px}" y="${height-bottom+20}" text-anchor="middle">${v.toFixed(1)}</text>`;}
  ['all','Burrard_15km','regional'].forEach((key,i)=>{
    const y=top+i*80;s+=`<text class="chart-label" x="0" y="${y+34}">${names[key]}</text>`;
    [['annual_inventory_prior','A'],['training_inferred_sources','G'],['constant','constant']].forEach(([model,c],j)=>{
      const value=model==='constant'?data.history.constant_metrics[key].RMSE_ppb:data.history.metrics[key][model].RMSE_ppb;
      const py=y+j*18;s+=`<rect x="${left}" y="${py}" width="${Math.max(0,x(value)-left)}" height="12" rx="2" fill="${colour[c]}"><title>${names[key]} ${modelNames[model]} RMSE ${value} ppb</title></rect><text class="value-label" x="${x(value)+6}" y="${py+10}" style="font-size:10px">${value.toFixed(3)}</text>`;
    });
  });
  s+=`<text x="${width-right}" y="${height-4}" text-anchor="end">RMSE / ppb</text>`;
  $('group-chart').innerHTML=svg(width,height,s,'全部、Burrard和区域站的A/G/常数RMSE');
  $('group-chart').insertAdjacentHTML('beforeend',`<div class="legend">${legend([['A 年库存',colour.A],['G 源约束',colour.G],['训练常数',colour.constant]])}</div>`);
}
function stationChart(station){
  const rows=station.reports,width=900,height=300,L=49,R=20,T=20,B=45;
  const times=rows.map(r=>Date.parse(r.time_utc)),start=times[0],end=times.at(-1);
  const maximum=Math.max(1,Math.ceil(Math.max(...rows.flatMap(r=>[r.observed_ppb,r.A_ppb,r.G_ppb]))*1.1*2)/2);
  const x=t=>L+(t-start)/(end-start)*(width-L-R),y=v=>height-B-v/maximum*(height-T-B);let s='';
  for(let i=0;i<=4;i++){const v=maximum*i/4,py=y(v);s+=`<line class="grid" x1="${L}" x2="${width-R}" y1="${py}" y2="${py}"/><text x="${L-9}" y="${py+4}" text-anchor="end">${v.toFixed(1)}</text>`;}
  for(let i=0;i<=4;i++){const t=start+(end-start)*i/4,stamp=new Date(t).toISOString();s+=`<text x="${x(t)}" y="${height-B+22}" text-anchor="${i===0?'start':i===4?'end':'middle'}">${stamp.slice(5,10)} ${stamp.slice(11,16)}</text>`;}
  for(const [field,c] of [['A_ppb',colour.A],['G_ppb',colour.G],['observed_ppb',colour.observed]]){
    let d='';rows.forEach((r,i)=>{d+=(i===0||times[i]-times[i-1]>1.1*3600000?'M':'L')+`${x(times[i]).toFixed(2)},${y(r[field]).toFixed(2)} `;});
    s+=`<path class="series ${field==='observed_ppb'?'observed':''}" d="${d}" stroke="${c}"/>`;
  }
  rows.forEach((r,i)=>{s+=`<circle class="point" cx="${x(times[i])}" cy="${y(r.observed_ppb)}" r="2.5"><title>${r.time_utc} 实测${r.observed_ppb} / A ${r.A_ppb} / G ${r.G_ppb} ppb</title></circle>`;});
  s+=`<text x="${L}" y="11">ppb</text><text x="${width-R}" y="${height-1}" text-anchor="end">UTC · 缺报不补零</text>`;
  $('station-chart').innerHTML=svg(width,height,s,`${station.id}站实际小时报告与A/G预测`)+`<div class="legend">${legend([['原始实测',colour.observed],['A 年库存',colour.A],['G 源约束',colour.G]])}</div>`;
  const a=station.scores.annual_inventory_prior.RMSE_ppb,g=station.scores.training_inferred_sources.RMSE_ppb;
  $('station-caption').textContent=`NAPS ${station.id} · ${station.city} · ${rows.length}份报告；RMSE ${fmt(a)} → ${fmt(g)} ppb，${g<a?'改善':'退化'}。该站未用于源系数拟合。`;
}
function rainChart(data){
  const versions=data.month.versions,done=versions.filter(v=>v.complete),width=1000,height=315,L=50,R=22,T=22,B=40;
  const maximum=Math.max(data.month.first_release_2mm?2.2:1.4,Math.ceil(Math.max(...done.flatMap(v=>v.rain.d02.map(r=>r.rmse)))*5)/5);
  const x=h=>L+h/24*(width-L-R),y=v=>height-B-v/maximum*(height-T-B);let s='';
  for(let i=0;i<=4;i++){const value=maximum*i/4,py=y(value);s+=`<line class="grid" x1="${L}" x2="${width-R}" y1="${py}" y2="${py}"/><text x="${L-9}" y="${py+4}" text-anchor="end">${value.toFixed(2)}</text>`;}
  for(const hour of [0,6,12,18,24])s+=`<text x="${x(hour)}" y="${height-B+23}" text-anchor="middle">${hour} h</text>`;
  s+=`<line class="threshold" x1="${L}" x2="${width-R}" y1="${y(1)}" y2="${y(1)}"/><text x="${width-R-5}" y="${y(1)-8}" text-anchor="end" style="fill:#a47756">原逐帧门 1 mm</text>`;
  if(data.month.first_release_2mm)s+=`<line class="threshold" x1="${L}" x2="${width-R}" y1="${y(2)}" y2="${y(2)}" style="stroke:#567c55"/><text x="${width-R-5}" y="${y(2)-8}" text-anchor="end" style="fill:#567c55">用户授权首版 2 mm</text>`;
  versions.forEach((version,i)=>{if(!version.complete)return;const d=version.rain.d02.map((r,j)=>`${j?'L':'M'}${x(r.lead_h).toFixed(2)},${y(r.rmse).toFixed(2)}`).join(' ');s+=`<path class="series" stroke="${seriesColours[i]}" d="${d}"><title>${escapeHTML(version.label)} · d02 RAINNC RMSE，完整门${version.pass?'通过':'未通过'}</title></path>`;});
  $('rain-chart').innerHTML=svg(width,height,s,'不同GPU版本对同一CPU参考的逐小时降水RMSE，阈值1mm');
  $('rain-legend').innerHTML=legend(versions.map((v,i)=>[v.label+(v.complete?'':' · 未完整评分'),seriesColours[i]]));
}
function render(data){
  window.RESULTS=data;
  $('snapshot').textContent='报告快照 · '+new Date(data.snapshot_utc).toISOString().slice(0,16).replace('T',' ')+' UTC';
  const history=data.history;
  $('all-rmse').textContent=fmt(history.metrics.all.annual_inventory_prior.RMSE_ppb,3)+' → '+fmt(history.metrics.all.training_inferred_sources.RMSE_ppb,3);
  $('regional-rmse').textContent=fmt(history.metrics.regional.annual_inventory_prior.RMSE_ppb,3)+' → '+fmt(history.metrics.regional.training_inferred_sources.RMSE_ppb,3);
  $('constant-rmse').textContent=fmt(history.constant_metrics.all.RMSE_ppb);
  $('metrics-table').innerHTML=Object.entries(names).flatMap(([key,label])=>['annual_inventory_prior','training_inferred_sources','constant'].map(model=>{
    const v=model==='constant'?history.constant_metrics[key]:history.metrics[key][model];return `<tr><td>${label}</td><td>${modelNames[model]}</td><td>${v.n_reports} / ${v.n_stations}</td><td>${fmt(v.RMSE_ppb)}</td><td>${fmt(v.MAE_ppb)}</td><td>${fmt(v.bias_ppb)}</td></tr>`;
  })).join('');
  $('source-factors').innerHTML=history.factors.map(v=>`<tr><td>${escapeHTML(v.group)}</td><td>${fmt(v.conditional_multiplier)}</td><td>${fmt(v.nominal_annual_inventory_tonnes,3)}</td></tr>`).join('');
  $('station-select').innerHTML=history.stations.map(s=>`<option value="${s.id}">${s.id} · ${escapeHTML(s.city.replace('Metro Vancouver - ',''))}</option>`).join('');
  $('station-select').addEventListener('change',e=>stationChart(history.stations.find(s=>s.id===e.target.value)));
  $('stations-table').innerHTML=history.stations.map(s=>{
    const a=s.scores.annual_inventory_prior.RMSE_ppb,g=s.scores.training_inferred_sources.RMSE_ppb;
    return `<tr><td>${s.id} · ${escapeHTML(s.city)}</td><td>${s.reports.length}</td><td>${fmt(a)}</td><td>${fmt(g)}</td><td class="${g<a?'good':'bad'}">${g<a?'改善':'退化'} ${(g-a)>0?'+':''}${fmt(g-a)}</td></tr>`;
  }).join('');
  $('ground-value').textContent=fmt(history.ground_check.web_ppb,9);
  $('ground-error').textContent=history.ground_check.independent_absolute_error_ppb.toExponential(3);
  $('airport-table').innerHTML=Object.entries(history.airport_metrics).map(([name,v])=>`<tr><td>${name}</td><td>${v.n_temperature}</td><td>${fmt(v.T_RMSE_K)}</td><td>${fmt(v.T_bias_K)}</td><td>${v.n_vector_wind}</td><td>${fmt(v.vector_RMSE_m_s)}</td></tr>`).join('');
  $('near-source-table').innerHTML=history.near_sources.map(v=>`<tr><td>${escapeHTML(v.name)}</td><td>${fmt(v.annual_prior_tonnes,3)}</td><td>${v.vertical.height_AGL_m}</td><td>${v.vertical.diameter_m}</td><td>${v.vertical.exit_velocity_m_s}</td><td>${v.vertical.exit_temperature_K}</td><td>${fmt(v.annual_prior_kg_s,9)}</td></tr>`).join('');
  groupChart(data);stationChart(history.stations[0]);rainChart(data);
  const versions=data.month.versions;
  $('rain-table-head').innerHTML='<tr><th>模式小时</th>'+versions.map(v=>`<th>${escapeHTML(v.label)}</th>`).join('')+'</tr>';
  $('rain-table-body').innerHTML=[19,20,21,22,23,24].map(h=>`<tr><td>${h} h</td>`+versions.map(v=>{const r=v.rain.d02?.find(r=>r.lead_h===h);return `<td class="${r&&r.rmse>1?'bad':''}">${r?fmt(r.rmse):'待完整评分'}</td>`;}).join('')+'</tr>').join('');
  const badge=(value,complete=true)=>!complete?'<span class="badge pending">待验证</span>':`<span class="badge ${value?'pass':'fail'}">${value?'通过':'未通过'}</span>`;
  $('gpu-versions').innerHTML=versions.map(v=>`<tr><td>${escapeHTML(v.label)}</td><td>${escapeHTML(v.change)}</td><td>${badge(v.domains.d01?.pass,v.complete)}</td><td>${badge(v.domains.d02?.pass,v.complete)}</td><td>${badge(v.pass,v.complete)}</td></tr>`).join('');
  $('failure-table').innerHTML=versions.filter(v=>v.complete).flatMap(v=>Object.entries(v.domains).flatMap(([domain,d])=>d.failures.flatMap(f=>(f.detail||[{}]).map(detail=>`<tr><td>${escapeHTML(v.label)}</td><td>${domain}</td><td>${escapeHTML(f.field||f.kind)}</td><td>${f.lead_h??'—'}</td><td>${escapeHTML(detail.metric||f.kind)}</td><td class="bad">${num(detail.value)}</td><td>${num(detail.limit)}</td></tr>`)))).join('');
  $('negative-table').innerHTML=versions.filter(v=>v.complete&&v.weather_negative_traces_d02).map(v=>`<tr><td>${escapeHTML(v.label)}</td>`+['QCLOUD','QRAIN','QICE','QSNOW','QGRAUP'].map(field=>`<td>${v.weather_negative_traces_d02[field]?.minimum?.toExponential(3)??'记录未列出'}</td>`).join('')+'</tr>').join('');
  const latest=versions.at(-1);
  const changes=data.month.latest_d02_field_RMSE_changes_vs_original;
  if(changes)$('field-changes').textContent=`最新候选相对原GPU的d02全字段RMSE：${changes.improved}项改善、${changes.worsened}项恶化、${changes.unchanged}项相同。另${changes.no_numeric_metric??changes.missing??0}项是Times元数据，无数值指标；实际缺失字段为空。各字段RMSE／最大误差及原单位见下载，未挑选改善项。`;
  if(latest.complete){
    $('active-experiment').textContent='W＋云水冻结条件 · 完整24小时门'+(latest.pass?'通过，待资格复核':'未通过');
    $('active-description').textContent='已按同一CPU参考、全部字段、两域、25时次和原阈值评分。'+(latest.pass?'这仍不等于720小时生产和污染输送完成。':'失败结果保留，未将此版本准入月生产。');
    $('latest-gate').textContent=latest.pass?'24小时通过 · 月生产待复核':'完整24小时门仍未通过';
    const originalFailures=new Set(Object.entries(versions[0].domains).flatMap(([d,v])=>v.failures.map(f=>`${d}:${f.field}:${f.lead_h}:${f.kind}`)));
    const newFailures=Object.entries(latest.domains).flatMap(([d,v])=>v.failures.filter(f=>!originalFailures.has(`${d}:${f.field}:${f.lead_h}:${f.kind}`)).map(f=>`${d} ${f.field||f.kind} ${f.lead_h??'—'} h`));
    $('new-failures').textContent=newFailures.length?'相对原版本新增失败：'+newFailures.join('；')+'。其余原失败及完整数值均保留在下方表格。':'相对原版本没有新增失败项；完整门结论仍以全部变量和完整性为准。';
  }else{
    const active=data.month.active_snapshot;
    $('active-experiment').textContent='W＋云水冻结条件 · 本轮24小时对照待完整评分';
    $('active-description').textContent=`状态截至 ${utcStamp(active.report_updated_utc||data.snapshot_utc)}。${active.native_exit_code===0?'数值积分已结束，尚待完整门结果。':'积分／编译或评分尚在进行。'} 页面为静态快照，暂无合格的720小时输出。`;
  }
  if(data.month.first_release_2mm){
    const release=data.month.first_release_2mm,progress=release.progress;
    $('month-status').textContent='2 mm首版已准入 · 连续720h计算中';
    $('month-title').textContent='连续一个月，首版正在计算';
    $('latest-gate').textContent='2 mm首版通过 · 原1 mm失败保留';
    $('latest-gate').className='badge pass';
    $('active-experiment').textContent='用户授权2 mm首版：同一24h检查点继续到720h';
    const lead=progress.available_hour_not_final_validation;
    const stamp=utcStamp(progress.updated_UTC||data.snapshot_utc);
    $('active-description').textContent=`截至报告快照 ${stamp}，${lead==null?'尚无新输出时刻':'可用天气输出推进到 '+lead+' / 720 模拟小时（存在性进度，非最终验证）'}。正式完成后还需721时次完整检查、真实污染输送和产品核验。`;
    $('new-failures').textContent+=' 用户明确允许逐帧RAINNC网格RMSE≤2 mm后，最新候选已另行通过首版准入；原1 mm门没有被改写。';
    $('first-release-limit').textContent='原1 mm保留 · 首版 ≤ 2 mm';
    const download=document.createElement('a');download.href='./data/first-release-qualification.json';download.download='first-release-qualification.json';download.innerHTML='<strong>2 mm首版准入</strong><span>JSON · 新条件、原失败与适用范围 ↗</span>';document.querySelector('.download-links').append(download);
  }
  if(data.month.first_release360){
    const completed=data.month.completed_period;
    $('month-status').textContent=completed?'连续360h产品已完成':'360h气象完成 · SO₂输送中';
    $('month-title').textContent=completed?'连续15天，完整小时场':'连续15天首版';
    $('active-experiment').textContent='用户授权：360h → 默认15秒';
    $('active-description').textContent=completed?'实际360个连续小时平均场、16高度层；原生有限非负、ZERO对照与干湿／出域质量预算均通过。本次动态发布仅含三源增量；背景粒子传播因局部浓度异常暂停采用，NASA起报场单独提供静态参考。':'气象前361时次×2域已完整冻结；不重算已有天气，后续连续输送和产品独立验证。';
    if(completed){
      const block=document.createElement('div');block.className='table-scroll';block.innerHTML='<table><caption>本次360h三源质量收支 · kg</caption><thead><tr><th>质量标签</th><th>初始</th><th>排放</th><th>保留</th><th>干沉降</th><th>湿沉降</th><th>出域</th><th>残差</th></tr></thead><tbody>'+completed.mass_ledger.map(r=>'<tr><td>'+escapeHTML(r.species)+'</td>'+['initial_kg','emitted_kg','retained_kg','dry_kg','wet_kg','boundary_outflow_kg','residual_kg'].map(k=>'<td>'+Number(r[k]).toPrecision(5)+'</td>').join('')+'</tr>').join('')+'</tbody></table><p class="fine">全部360时次有限非负，ZERO严格为0；累计沉降取末张累计，不重复累加。质量守恒通过不等于未来观测精度已验证。</p>';document.getElementById('month').append(block);
      for(const [file,label]of [['period360-mass-ledger.json','15天完整期与质量检查'],['period360-mass-ledger.csv','15天质量收支CSV']]){const a=document.createElement('a');a.href='./data/'+file;a.download=file;a.innerHTML='<strong>'+label+'</strong><span>实际360h · 原始数值与适用范围 ↗</span>';document.querySelector('.download-links').append(a);}
    }
  }
  const ni=data.month.local_cloud_test.Ni;$('ni-comparison').textContent=fmt(ni.original_RMSE,3)+' → '+fmt(ni.private_RMSE,3);
  window.RESULTS_READY=true;
}
fetch('./data/results.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(render).catch(error=>{console.error('Results snapshot failed:',error);$('data-error').hidden=false;});
