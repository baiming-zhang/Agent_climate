import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {DRACOLoader} from './vendor/DRACOLoader.js';
import {queryNativeGround} from './ground.js';
import {createNearSources} from './multisource_r07.js?v=r07';
import {colourLandmarks} from './landmark_materials.js?v=1';
const $=id=>document.getElementById(id),canvas=$('scene'),renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color('#edf2ef');
const camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.003,250);camera.position.set(-2,7,14);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=.08;controls.maxDistance=130;controls.maxPolarAngle=Math.PI*.49;controls.target.set(-6,.1,-1);
scene.add(new THREE.HemisphereLight('#ffffff','#b4c4b9',2.5));const sun=new THREE.DirectionalLight('#fff7e6',2.3);sun.position.set(-12,25,8);scene.add(sun);
const target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true});target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
const volumeScene=new THREE.Scene();
let meta,terrain,model='G',displayModel='G',timeValue=0,playing=false,current=[],volume,material,trailObject,lastProbe,ready=false,lastKey='',requestId=0,desired=0,fullDuration=15,playStartWall=0,playStartIndex=0,preparingPlay=false,lastTrailIndex=-1;
let viewMode='regional',near,nearTime=0,nearStart=0;const oldMetric=$('metric').innerHTML,oldLabels=document.querySelector('.timeLabels').innerHTML,oldDetails=document.querySelector('details').innerHTML;
const cache=new Map(),readyFields=new Map(),preloads=new Map(),trackCache=new Map();
const shader={
vertex:`varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
fragment:`precision highp float;precision highp sampler3D;
varying vec3 vWorld;out vec4 fragColor;uniform sampler3D field0;uniform sampler3D field1;uniform sampler2D depthMap;uniform vec3 lo;uniform vec3 hi;uniform vec3 shape;uniform vec3 eye;uniform vec2 resolution;uniform mat4 inverseVP;uniform float weight;uniform float gain;uniform float enabled;uniform vec3 pigment;
vec3 colour(float c){float t=clamp(log(1.+c)/log(11.),0.,1.);return pigment;}
float concentration(vec3 p){vec3 q=(p-lo)/(hi-lo);q=vec3(q.x,1.-q.z,q.y);q=(q*(shape-1.)+.5)/shape;return mix(texture(field0,q).r,texture(field1,q).r,weight);}
void main(){if(enabled<.5)discard;vec3 d=normalize(vWorld-eye),inv=1./d;vec3 aa=(lo-eye)*inv,bb=(hi-eye)*inv;vec3 mn=min(aa,bb),mx=max(aa,bb);float entry=max(max(mn.x,mn.y),mn.z),exit=min(min(mx.x,mx.y),mx.z);entry=max(entry,0.);vec2 uv=gl_FragCoord.xy/resolution;float dep=texture2D(depthMap,uv).x;vec4 gp=inverseVP*vec4(uv*2.-1.,dep*2.-1.,1.);vec3 ground=gp.xyz/gp.w;if(dep<.999999)exit=min(exit,length(ground-eye));if(exit<=entry)discard;float stepSize=(exit-entry)/192.;vec4 acc=vec4(0.);for(int i=0;i<192;i++){float t=entry+(float(i)+.5)*stepSize;vec3 p=eye+d*t;float c=concentration(p);if(c>.002){float alpha=1.-exp(-c*gain*stepSize*1.1);vec3 col=colour(c);acc.rgb+=(1.-acc.a)*alpha*col;acc.a+=(1.-acc.a)*alpha;if(acc.a>.985)break;}}if(acc.a<.001)discard;fragColor=vec4(acc.rgb/max(acc.a,.000001),acc.a);}`
};
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();const s=renderer.getDrawingBufferSize(new THREE.Vector2());target.setSize(s.x,s.y);if(material)material.uniforms.resolution.value.copy(s);}
window.addEventListener('resize',resize);resize();
function view(which){
  if(['source','FCC','WTE','CEMENT','sources','UBC'].includes(which)){if(viewMode!=='near'&&which!=='UBC')enterNear(false);if(which==='sources')near.all(controls);else if(which==='UBC')near.campus(controls);else near.focus(which==='source'?'FCC':which,controls);clearProbe();nearInfo();return;}
  if(which==='peak'&&current.length){const [nx,ny,nz]=meta.shape;let max=-1,index=0;const w=timeValue-Math.floor(timeValue);for(let j=0;j<current[0].f.length;j++){const c=current[0].f[j]*(1-w)+current[1].f[j]*w;if(c>max){max=c;index=j;}}const ix=index%nx,iy=Math.floor(index/nx)%ny,iz=Math.floor(index/(nx*ny));const lo=meta.world_min,hi=meta.world_max;const p=new THREE.Vector3(lo[0]+(hi[0]-lo[0])*ix/(nx-1),lo[1]+(hi[1]-lo[1])*iz/(nz-1),hi[2]-(hi[2]-lo[2])*iy/(ny-1));controls.target.copy(p);camera.position.copy(p).add(new THREE.Vector3(3.3,2.3,4.2));controls.update();return;}
  const targets={overview:[[ -4,5.8,8.5],[-11,.2,-2.2]],city:[[-10.8,2.5,3.1],[-12.3,.05,.4]],refinery:[[-.8,2.2,2.8],[-3.15,.15,-1.33]],all:[[18,27,33],[-9,0,-2]]};
  const [p,t]=targets[which];camera.position.set(...p);controls.target.set(...t);controls.update();
}
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>view(b.dataset.view);
$('gain').oninput=()=>{$('gainValue').textContent=Number($('gain').value).toFixed(2)+'×';if(material)material.uniforms.gain.value=Number($('gain').value);if(near)near.update(nearTime,model,Number($('gain').value));};
$('smoke').onchange=()=>{if(material)material.uniforms.enabled.value=$('smoke').checked?1:0;};
function stopPlayback(){playing=false;$('play').textContent=(viewMode==='near'?nearTime>=120:timeValue>=142)?'↻ Replay':'▶ Play';}
function clearProbe(){lastProbe=undefined;marker.visible=false;$('probe').innerHTML='Select a plume to inspect concentration and height';}
function nearUpdate(t){nearTime=Math.max(0,Math.min(120,t));near.update(nearTime,model,Number($('gain').value));clearProbe();$('time').textContent=`Since release: ${nearTime.toFixed(1)} s`;$('frame').textContent='Conditional release';$('timeline').value=nearTime;}
function nearInfo(){const r=near.record,m=r.observed,measured=r.driver==='observed',wind=measured?m.speed_m_s:r.rise.actual_wind_m_s;$('metric').innerHTML=`${near.sources.find(s=>s.record===r)?.data.name_en||'Three industrial sources'}<br>Wind ${wind.toFixed(1)} m/s · Precipitation ${r.weather.precip_liquid_equivalent_mm_h.toFixed(2)} mm/h`;$('status').textContent='Independent conditional release · not an actual startup record';}

function enterNear(auto=true){if(!near)return;stopPlayback();requestId++;viewMode='near';$('scope').value='near';$('nearCondition').hidden=false;$('weatherLabel').hidden=false;$('timeScope').textContent='Conditional release · instantaneous concentration';document.querySelector('.legend').hidden=true;document.querySelector('.ticks').hidden=true;$('densityLegend').hidden=false;document.querySelector('details').innerHTML='<summary>Methods and scope</summary><p>Independent120 s conditional releases use Briggs rise, Hanna/OU dispersion, Gaussian puffs and wet removal, not full CFD. Surface weather uses historical ECCC reports; vertical structure is modelled by WRF. Annual emissions and stack parameters are priors, not live operating records. This view is separate from the regional field.</p>';$('timeline').max=120;document.querySelector('.timeLabels').innerHTML='<span>Release +0s</span><span>120 s release</span><span>+120s</span>';$('trails').disabled=true;if(trailObject)trailObject.visible=false;$('model').options[0].textContent='G · inferred weights';$('model').options[1].textContent='A · annual inventory';nearInfo();nearUpdate(0);near.view(controls);if(auto)startPlayback();}
async function enterRegional(){stopPlayback();requestId++;viewMode='regional';$('play').textContent='▶ Play';$('scope').value='regional';$('nearCondition').hidden=true;$('weatherLabel').hidden=true;$('timeScope').textContent='UTC ·30-minute mean';document.querySelector('.legend').hidden=false;document.querySelector('.ticks').hidden=false;$('densityLegend').hidden=true;document.querySelector('details').innerHTML=oldDetails;$('timeline').max=142;document.querySelector('.timeLabels').innerHTML=oldLabels;$('trails').disabled=false;$('metric').innerHTML=oldMetric;$('model').options[0].textContent='G · inferred weights';$('model').options[1].textContent='A · annual inventory';clearProbe();await setTime(timeValue);preloadModel(model).catch(fail);view('overview');if(trailObject)trailObject.visible=$('trails').checked;}
$('scope').onchange=()=>{$('scope').value==='near'?enterNear():enterRegional();};
$('condition').onchange=()=>{near.choose(Number($('condition').value));nearInfo();nearUpdate(nearTime);};
$('weather').onchange=()=>{near.setDriver($('weather').value);nearInfo();nearUpdate(nearTime);};
function colour(hex){near?.setColour(hex);if(material){const c=parseInt(hex.slice(1),16);material.uniforms.pigment.value.set((c>>16&255)/255,(c>>8&255)/255,(c&255)/255);}}
$('colour').oninput=()=>colour($('colour').value);$('resetColour').onclick=()=>{$('colour').value='#777d82';colour('#777d82');};
$('model').onchange=async()=>{if(viewMode==='near'){nearUpdate(nearTime);nearInfo();return;}const resume=playing;stopPlayback();model=$('model').value;await setTime(timeValue);purgeOtherModels(model);preloadModel(model);if(resume)await startPlayback();};
// Model selection also changes the independent FCC mass rate, never its path.
$('model').addEventListener('change',()=>{if(viewMode==='near'){model=$('model').value;nearUpdate(nearTime);}});
$('timeline').oninput=()=>{stopPlayback();if(viewMode==='near')nearUpdate(Number($('timeline').value));else{desired=Number($('timeline').value);setTime(desired);}};
$('play').onclick=()=>{if(playing)stopPlayback();else startPlayback();};
$('duration').oninput=()=>{fullDuration=Math.max(5,Math.min(120,Number($('duration').value)||15));$('durationValue').textContent=fullDuration+' s';playStartWall=performance.now();playStartIndex=timeValue;nearStart=nearTime;};
async function startPlayback(){
 if(viewMode==='near'){if(nearTime>=120)nearUpdate(0);nearStart=nearTime;playStartWall=performance.now();playing=true;$('play').textContent='Ⅱ Pause';return;}
 if(preparingPlay)return;preparingPlay=true;$('play').disabled=true;const selected=model;
 try{await preloadModel(selected);if(selected!==model||viewMode!=='regional')return;if(timeValue>=142)await setTime(0);requestId++;playStartIndex=timeValue;playStartWall=performance.now();playing=true;$('play').textContent='Ⅱ Pause';}
 catch(e){fail(e);}finally{preparingPlay=false;$('play').disabled=false;}
}
function nearProbe(e){if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>4||e.button!==0)return;const raycaster=new THREE.Raycaster();raycaster.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),camera);const hit=raycaster.intersectObjects(scene.children,true).find(o=>o.object.isMesh);const p=near.probe(raycaster.ray,hit?hit.distance:5);if(!p){$('probe').textContent='No current-release plume along this view.';return;}lastProbe=p;marker.position.fromArray(p.world);marker.visible=true;$('probe').innerHTML=`<strong>${p.ppb.toFixed(3)}</strong> ppb<br>AGL ${p.AGL_m.toFixed(1)} m · ${p.source||'Sources'}model<br>Since release: ${nearTime.toFixed(1)} s`;}
$('save').onclick=()=>{const a=document.createElement('a');a.download=`Vancouver_SO2_${model}_${Math.floor(timeValue)+1}.png`;a.href=renderer.domElement.toDataURL('image/png');a.click();};
async function unzip(url){const r=await fetch(url);if(!r.ok)throw Error(`${r.status} ${url}`);return await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}
function key(i,m){return `${i}_${m}`;}
// Each buffer is uploaded before playback, and the rendered pair/time commit
// together. Crossing an output boundary cannot reset an old pair's weight.
const decodeQueue=[],decodeSlots=[],decodePending=new Map();let decodeId=0;
for(let i=0;i<2;i++){
 const worker=new Worker(new URL('./volume_worker.js',import.meta.url),{type:'module'});const slot={worker,busy:false};decodeSlots.push(slot);
 worker.onmessage=({data})=>{const job=decodePending.get(data.id);decodePending.delete(data.id);slot.busy=false;if(data.error)job.reject(Error(data.error));else job.resolve(new Float32Array(data.values));pumpDecode();};
 worker.onerror=e=>fail(Error(e.message));
}
function pumpDecode(){for(const slot of decodeSlots){if(slot.busy||!decodeQueue.length)continue;const job=decodeQueue.shift();slot.busy=true;decodePending.set(job.id,job);slot.worker.postMessage({id:job.id,url:job.url,cap:meta.log_quantization_cap_ppb});}}
function decodeField(url){return new Promise((resolve,reject)=>{decodeQueue.push({id:++decodeId,url:new URL(url,location.href).href,resolve,reject});pumpDecode();});}
async function field(i,m=model){
 const k=key(i,m);if(cache.has(k))return cache.get(k);
 const p=(async()=>{const f=await decodeField(`data/volumes/${String(i+1).padStart(4,'0')}_${m}.bin.gz`);const tex=new THREE.Data3DTexture(f,...meta.shape);tex.format=THREE.RedFormat;tex.type=THREE.FloatType;tex.minFilter=tex.magFilter=THREE.LinearFilter;tex.unpackAlignment=1;tex.needsUpdate=true;renderer.initTexture(tex);const value={f,tex};if(m===model||m===displayModel)readyFields.set(k,value);return value;})();cache.set(k,p);return await p;
}
function purgeOtherModels(m){for(const [k,p] of cache){if(!k.endsWith('_'+m)){p.then(v=>v.tex.dispose());cache.delete(k);readyFields.delete(k);}}for(const k of preloads.keys())if(k!==m)preloads.delete(k);}
function commitTime(t,m,pair){
 const a=Math.min(142,Math.floor(t));current=pair;displayModel=m;timeValue=t;desired=t;
 material.uniforms.field0.value=pair[0].tex;material.uniforms.field1.value=pair[1].tex;material.uniforms.weight.value=t-a;lastKey=`${m}_${a}_${Math.min(142,a+1)}`;updateTime();
 if($('trails').checked&&a!==lastTrailIndex){lastTrailIndex=a;updateTrails(a);}
}
async function setTime(t){
 if(!meta)return;const selected=model,id=++requestId;desired=Math.max(0,Math.min(142,t));const wanted=desired,a=Math.floor(wanted),b=Math.min(142,a+1);
 try{if(!readyFields.has(key(a,selected))||!readyFields.has(key(b,selected)))$('status').textContent='Preparing selected time…';const pair=await Promise.all([field(a,selected),field(b,selected)]);if(id!==requestId||selected!==model)return;commitTime(wanted,selected,pair);if(!preparingPlay)$('status').textContent='143 times ·30-minute means loaded';}catch(e){fail(e);}
}
function preloadModel(m){
 if(preloads.has(m))return preloads.get(m);let done=0;const p=Promise.all(Array.from({length:143},(_,i)=>field(i,m).then(()=>{done++;if(model===m&&!playing)$('status').textContent=`Preparing playback ${done} / 143`; }))).then(()=>{if(model===m)$('status').textContent='Ready ·15 s default playback, adjustable';});preloads.set(m,p);return p;
}
function updateTime(){if(lastProbe&&(lastProbe.timeIndex!==timeValue||lastProbe.model!==model)){lastProbe=undefined;marker.visible=false;$('probe').innerHTML='Select a plume to inspect concentration and height';}const i=Math.min(142,Math.floor(timeValue)),raw=meta.frames[i].time;const d=new Date(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T${raw.slice(9,11)}:${raw.slice(11,13)}:00Z`);d.setUTCMinutes(d.getUTCMinutes()+Math.round((timeValue-i)*30));$('time').textContent=d.toISOString().slice(0,16).replace('T',' ')+' UTC';$('frame').textContent=`${i+1} / 143`;$('timeline').value=timeValue;}
async function tracks(i){if(!trackCache.has(i))trackCache.set(i,unzip(`data/tracks/${String(i+1).padStart(4,'0')}.bin.gz`).then(b=>new Float32Array(b)));return await trackCache.get(i);}
async function updateTrails(i){const snapshots=await Promise.all(Array.from({length:Math.min(5,i+1)},(_,j)=>tracks(i-j)));if(!($('trails').checked)||Math.floor(timeValue)!==i)return;const positions=[],colours=[],pal=['#4b4b4b','#707070','#969696','#555555','#b0b0b0'].map(x=>new THREE.Color(x));let newer;
const chosen=new Set(),nearest=[];for(let j=0;j<snapshots[0].length;j+=8){const s=snapshots[0];nearest.push([Math.hypot(s[j+3]-controls.target.x,s[j+4]-controls.target.y,s[j+5]-controls.target.z),j]);}nearest.sort((a,b)=>a[0]-b[0]);for(const [,j] of nearest.slice(0,60)){chosen.add(`${snapshots[0][j]}:${snapshots[0][j+1]}:${snapshots[0][j+2]}`);}
for(const snap of snapshots){const map=new Map();for(let j=0;j<snap.length;j+=8){const id=`${snap[j]}:${snap[j+1]}:${snap[j+2]}`;if(!chosen.has(id))continue;const p=[snap[j+3],snap[j+4],snap[j+5]],group=snap[j+6];map.set(id,p);if(newer?.has(id)){positions.push(...p,...newer.get(id));const c=pal[group];colours.push(c.r,c.g,c.b,c.r,c.g,c.b);}}newer=map;}
if(trailObject){scene.remove(trailObject);trailObject.geometry.dispose();trailObject.material.dispose();}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));trailObject=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.55,depthWrite:false}));trailObject.name='Actual identity-matched parcel paths';scene.add(trailObject);}
$('trails').onchange=()=>{if(trailObject)trailObject.visible=$('trails').checked;if($('trails').checked)updateTrails(Math.floor(timeValue));};
function scalar(f,x,y,z){const [nx,ny,nz]=meta.shape;const xx=Math.max(0,Math.min(nx-1,x*(nx-1))),yy=Math.max(0,Math.min(ny-1,y*(ny-1))),zz=Math.max(0,Math.min(nz-1,z*(nz-1)));let x0=Math.floor(xx),y0=Math.floor(yy),z0=Math.floor(zz),out=0;for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++){const ix=Math.min(nx-1,x0+i),iy=Math.min(ny-1,y0+j),iz=Math.min(nz-1,z0+k);out+=f[ix+nx*(iy+ny*iz)]*(i?xx-x0:1-xx+x0)*(j?yy-y0:1-yy+y0)*(k?zz-z0:1-zz+z0);}return out;}
async function queryGround(point){
 const p=new THREE.Vector3(point.x,point.y||0,point.z);let value;
 if(viewMode==='near'){
  let ppb=0;for(const source of near.sources)for(let i=0;i<10;i++)ppb+=source.sample(new THREE.Vector3(p.x,source.source.y+(i*2+1)*.001*1.8,p.z))/10;
  value={ppb,kind:'ground',AGL_m:10,layer_AGL_m:[0,20],world:p.toArray(),model,scope:'Independent conditional near-field, flat local ground,10point vertical quadrature'};
 }else value=await queryNativeGround(p,timeValue,model);
 if(!value){lastProbe=undefined;marker.visible=false;$('probe').textContent='Outside the computed domain';return null;}
 const xx=(p.x-meta.world_min[0])/(meta.world_max[0]-meta.world_min[0]),yy=1-(p.z-meta.world_min[2])/(meta.world_max[2]-meta.world_min[2]);
 if(xx>=0&&xx<=1&&yy>=0&&yy<=1){const nx=meta.shape[0],ny=meta.shape[1];p.y=terrain[Math.round(xx*(nx-1))+nx*Math.round(yy*(ny-1))]*.001*1.8+.003;}
 lastProbe={...value,world:p.toArray()};marker.position.copy(p);marker.visible=true;
 $('probe').innerHTML=`<strong>${value.ppb.toFixed(3)}</strong> ppb<br>Surface0–20 m · ${viewMode==='near'?'Conditional release':'Regional source contribution'}`;return lastProbe;
}
$('probeMode').onchange=()=>{clearProbe();$('probe').textContent=$('probeMode').value==='ground'?'Select the map for surface concentration':'Select a plume to inspect concentration and height';};
let down;
canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY]});
canvas.addEventListener('pointerup',e=>{if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<=4&&e.button===0){stopPlayback();if($('probeMode').value==='ground'){const raycaster=new THREE.Raycaster();raycaster.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),camera);const hit=raycaster.intersectObjects(scene.children,true).find(h=>h.object.isMesh&&h.object!==marker&&!h.object.name.includes('crest'));if(hit)queryGround(hit.point).catch(fail);return;}}if(viewMode==='near'){nearProbe(e);return;}if(!ready||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>4||e.button!==0||!current.length||displayModel!==model)return;const mouse=new THREE.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),raycaster=new THREE.Raycaster();raycaster.setFromCamera(mouse,camera);const ray=raycaster.ray,box=new THREE.Box3(new THREE.Vector3(...meta.world_min),new THREE.Vector3(...meta.world_max));const entry=ray.intersectBox(box,new THREE.Vector3());if(!entry)return;const start=box.containsPoint(camera.position)?0:Math.max(0,entry.distanceTo(camera.position)),far=raycaster.intersectObjects(scene.children,true).filter(o=>o.object.isMesh)[0];let end=far?far.distance:150,best=0,bp;const lo=box.min,span=box.getSize(new THREE.Vector3()),w=timeValue-Math.floor(timeValue);for(let t=start;t<end;t+=.025){const p=ray.at(t,new THREE.Vector3());if(!box.containsPoint(p))continue;const x=(p.x-lo.x)/span.x,y=1-(p.z-lo.z)/span.z,z=(p.y-lo.y)/span.y;const c=scalar(current[0].f,x,y,z)*(1-w)+scalar(current[1].f,x,y,z)*w;if(c>best){best=c;bp=p.clone();}}
if(bp){const x=(bp.x-lo.x)/span.x,y=1-(bp.z-lo.z)/span.z;const ix=Math.round(x*(meta.shape[0]-1)),iy=Math.round(y*(meta.shape[1]-1));const agl=Math.max(0,bp.y/1.8*1000-terrain[ix+meta.shape[0]*iy]);lastProbe={world:bp.toArray(),ppb:best,AGL_m:agl,timeIndex:timeValue,model};$('probe').innerHTML=`<strong>${best.toFixed(3)}</strong> ppb<br>Approx. AGL ${Math.round(agl)} m · Maximum along view ray<br>Regional source contribution · ${model}`;marker.position.copy(bp);marker.visible=true;}else $('probe').textContent='No source contribution above display precision on this ray.';});
const marker=new THREE.Mesh(new THREE.SphereGeometry(.04,12,8),new THREE.MeshBasicMaterial({color:'#e55d3a',depthTest:false}));marker.visible=false;scene.add(marker);
function fail(e){console.error(e);$('error').hidden=false;$('error').style.display='block';$('error').textContent='Loading failed: '+e.message;$('loading').style.display='none';}
async function init(){try{
$('loadingText').textContent='Loading city ·295,252 buildings';
const draco=new DRACOLoader().setDecoderPath('./vendor/draco/').setWorkerLimit(2);
const loader=new GLTFLoader().setDRACOLoader(draco);
const packed=await fetch('./city-draco.glb.gz');if(!packed.ok)throw Error('City model unavailable');
const cityBytes=await new Response(packed.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
$('loadingText').textContent='Preparing city geometry…';
const city=await loader.parseAsync(cityBytes,new URL('./',location.href).href);draco.dispose();colourLandmarks(city.scene);scene.add(city.scene);view('city');
if(new URLSearchParams(location.search).has('cityOnly')){$('loading').style.display='none';$('status').innerHTML='Geometry-only preview · <a href="./">Open concentration volume</a>';window.VANCOUVER={scene,camera,controls,renderer,view,ready:false};return;}
meta=await (await fetch('data/metadata.json')).json();terrain=new Float32Array(await(await fetch('data/terrain_height.bin')).arrayBuffer());
const lo=new THREE.Vector3(...meta.world_min),hi=new THREE.Vector3(...meta.world_max),span=hi.clone().sub(lo),center=lo.clone().add(hi).multiplyScalar(.5);
material=new THREE.ShaderMaterial({vertexShader:shader.vertex,fragmentShader:shader.fragment,glslVersion:THREE.GLSL3,transparent:true,depthTest:false,depthWrite:false,side:THREE.BackSide,uniforms:{field0:{value:null},field1:{value:null},depthMap:{value:target.depthTexture},lo:{value:lo},hi:{value:hi},shape:{value:new THREE.Vector3(...meta.shape)},eye:{value:camera.position},resolution:{value:renderer.getDrawingBufferSize(new THREE.Vector2())},inverseVP:{value:new THREE.Matrix4()},weight:{value:0},gain:{value:2},enabled:{value:1},pigment:{value:new THREE.Vector3(.467,.490,.510)}}});
// Three GLSL3 compatibility handles varying/texture2D/gl_FragColor aliases.
volume=new THREE.Mesh(new THREE.BoxGeometry(...span.toArray()),material);volume.position.copy(center);volumeScene.add(volume);await setTime(0);view('overview');ready=true;$('loadingText').textContent='Preparing plume and controls…';window.VANCOUVER={scene,camera,controls,renderer,meta,view,setTime,scalar,get current(){return current},get material(){return material},get lastProbe(){return lastProbe},queryGround, get ready(){return ready&&!!near},get mode(){return viewMode},enterNear,enterRegional,get nearSource(){return near},get playbackState(){return {playing,preparingPlay,timeValue:viewMode==='near'?nearTime:timeValue,duration:fullDuration,displayModel:viewMode==='near'?model:displayModel,pairIndex:Number(lastKey.split('_')[1]),weight:material.uniforms.weight.value,buffered:readyFields.size}}};near=await createNearSources(renderer,scene,target,camera);near.data.conditions_UTC.forEach((stamp,i)=>{const o=document.createElement('option');o.value=i;o.textContent=stamp.replace('_',' ')+' UTC';$('condition').appendChild(o);});$('condition').value=0;if(new URLSearchParams(location.search).get('mode')==='regional'){enterRegional();}else enterNear();$('loading').style.display='none';
}catch(e){fail(e);}}
let previous=performance.now();
function animate(now){requestAnimationFrame(animate);previous=now;controls.update();
 // A useful near plane preserves terrain/building/depth precision during orbit.
 const distance=camera.position.distanceTo(controls.target);camera.near=Math.max(.001,Math.min(.1,distance*.006));camera.far=250;camera.updateProjectionMatrix();
 if(ready&&playing&&viewMode==='near'){const next=Math.min(120,nearStart+(now-playStartWall)/1000*120/fullDuration);nearUpdate(next);if(next>=120)stopPlayback();}
 if(ready&&playing&&viewMode==='regional'){const next=Math.min(142,playStartIndex+(now-playStartWall)/1000*142/fullDuration),a=Math.floor(next),b=Math.min(142,a+1);const fa=readyFields.get(key(a,model)),fb=readyFields.get(key(b,model));if(fa&&fb)commitTime(next,model,[fa,fb]);if(next>=142)stopPlayback();}
 renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(scene,camera);
 near?.marker();
 if(ready&&viewMode==='regional'){material.uniforms.inverseVP.value.multiplyMatrices(camera.matrixWorld,camera.projectionMatrixInverse);renderer.autoClear=false;renderer.render(volumeScene,camera);renderer.autoClear=true;}else if(near&&$('smoke').checked){near.render();}
}
requestAnimationFrame(animate);init();
