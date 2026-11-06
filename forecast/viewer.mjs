import * as THREE from 'three';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {DRACOLoader} from '../vendor/DRACOLoader.js';
import {worldLonLat} from '../ground.js';
import {colourLandmarks} from '../landmark_materials.js?v=1';
import {createMonthQuery} from './native_query.mjs?v=en-source-r02';
import {makeScalarLookup,prepareDisplayFrame} from './display_codec.mjs';
import {monthShader} from './volume_shader.mjs?v=performance-r02';
import {formatPpb} from './format_ppb.mjs';
import {createWeatherEffects} from './weather_effects.mjs?v=continuous-r03';
import {loadInitialReference} from './initial_reference.mjs';
const $=id=>document.getElementById(id),canvas=$('scene');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color('#edf2ef');
scene.add(new THREE.HemisphereLight('#ffffff','#b4c4b9',2.5));const light=new THREE.DirectionalLight('#fff7e6',2.3);light.position.set(-12,25,8);scene.add(light);
const camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.004,350),controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=.1;controls.maxDistance=150;controls.maxPolarAngle=Math.PI*.49;
const target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true});target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
const copyScene=new THREE.Scene(),copyCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:target.texture,depthTest:false,depthWrite:false})));
const volumeScene=new THREE.Scene();const qBlocks=new Map(),textures=new Map(),groundBlocks=new Map();
let meta,material,terrain,coverage,queryNative,currentHours=0,duration=15,playing=false,ready=false,preparing=false,playStart=0,startHours=0,request=0,currentPair=[],marker,crest;
let lookups,weather,initialReference,referenceMode=false,savedSourceHours=0,lastClock=-Infinity,renderScale=1,lastFrame=0,frameEMA=16.7,perfFrames=0;const frameSize=()=>meta.display.shape_time_z_y_x_fields.slice(1).reduce((a,b)=>a*b,1);
async function bytes(url){const address=new URL(url,location.href);if(address.pathname.includes('/forecast/data/'))address.searchParams.set('rev','en-source-r02');const r=await fetch(address);if(!r.ok)throw Error('Data request failed '+r.status+': '+url);const b=new Uint8Array(await r.arrayBuffer());return b[0]===31&&b[1]===139?await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():b.buffer;}
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();const s=renderer.getDrawingBufferSize(new THREE.Vector2());target.setSize(s.x,s.y);if(material)material.uniforms.resolution.value.copy(s);}
addEventListener('resize',resize);resize();
function clearProbe(){if(marker)marker.visible=false;$('inspector').hidden=true;$('probe').textContent='';if(window.MONTH_CLIMATE)window.MONTH_CLIMATE.lastProbe=null;}
function stop(){playing=false;$('play').textContent='▶ Play';}
function formatUTC(milliseconds){return new Date(milliseconds).toISOString().slice(0,16).replace('T',' ')+' UTC';}
function initialTime(){const s=meta.initialization_UTC;return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s)?s:s+'Z');}
function clock(force=false){
 if(!force&&performance.now()-lastClock<90&&currentHours<meta.actual_hours)return;lastClock=performance.now();
 if(referenceMode){$('time').textContent=formatUTC(initialTime());$('timeScope').textContent='NASA initial field · static reference';$('frame').textContent='T₀';return;}
 $('timeline').value=currentHours;$('time').textContent=formatUTC(initialTime()+currentHours*3600000);
 const index=Math.min(meta.actual_hours-1,Math.max(0,Math.floor(currentHours)));
 $('timeScope').textContent=`${index}–${index+1} h mean · source increment`;$('frame').textContent=`${currentHours.toFixed(1)} / ${meta.actual_hours} h`;
}
async function blockFor(index){const chunk=meta.display.chunks.find(c=>index>=c.first_index&&index<c.first_index+c.count);if(!chunk)throw Error('Hour outside available output');if(!qBlocks.has(chunk.file))qBlocks.set(chunk.file,bytes('./data/'+chunk.file).then(b=>new Uint8Array(b)));return{chunk,packed:await qBlocks.get(chunk.file)};}
function frameFromLoaded(index){
 if(textures.has(index))return textures.get(index);
 const chunk=meta.display.chunks.find(c=>index>=c.first_index&&index<c.first_index+c.count),packed=chunk?.loaded;
 if(!packed)return null;
 const values=prepareDisplayFrame(meta,packed,chunk,index,lookups),[,nz,ny,nx]=meta.display.shape_time_z_y_x_fields;
 const texture=new THREE.Data3DTexture(values,nx,ny,nz);texture.format=THREE.RGFormat;texture.type=THREE.HalfFloatType;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.unpackAlignment=1;texture.needsUpdate=true;renderer.initTexture(texture);
 const entry={texture,values,index,packed,chunk};textures.set(index,entry);return entry;
}
function indices(hours){const i=Math.max(0,Math.min(meta.actual_hours-1,hours-.5)),a=Math.floor(i);return{a,b:Math.min(meta.actual_hours-1,a+1),weight:i-a};}
function commit(hours,a,b,weight){
 material.uniforms.field0.value=a.texture;material.uniforms.field1.value=b.texture;material.uniforms.timeWeight.value=weight;
 currentPair=[a,b];currentHours=hours;clock();
 // Dispose only after both new textures and all corresponding uniforms are ready.
 for(const[index,entry]of textures)if(textures.size>4&&index!==a.index&&index!==b.index){entry.texture.dispose();textures.delete(index);}
}
async function setHours(hours){
 const id=++request;hours=Math.max(0,Math.min(meta.actual_hours,Number(hours)));const{a,b,weight}=indices(hours);
 for(const index of new Set([a,b])){const block=await blockFor(index);block.chunk.loaded=block.packed;}
 if(weather)await Promise.all([...new Set([a,b])].map(i=>weather.prepare(i)));
 if(id!==request)return;const fa=frameFromLoaded(a),fb=frameFromLoaded(b);commit(hours,fa,fb,weight);clock(true);clearProbe();
}
async function preload(){
 let done=0,cursor=0;
 async function worker(){while(cursor<meta.display.chunks.length){const chunk=meta.display.chunks[cursor++],item=await blockFor(chunk.first_index);chunk.loaded=item.packed;done++;$('status').textContent=`Preparing playback ${done}/${meta.display.chunks.length} blocks`;}}
 await Promise.all([...Array.from({length:3},worker),weather?.preload()]);
}
async function play(){
 if(playing){stop();return;}if(preparing)return;preparing=true;$('play').textContent='Preparing…';
 try{await preload();if(currentHours>=meta.actual_hours)await setHours(0);startHours=currentHours;playStart=performance.now();playing=true;$('play').textContent='Ⅱ Pause';$('status').textContent='All hours ready · scalar interpolation';}finally{preparing=false;}
}
function view(which){
 const facility=meta.facilities?.find(f=>f.key===which);
 let p,t;if(facility){const s=weather?.sources.find(s=>facility.component_ids.includes(s.id)),row=s?.hourly[Math.min(meta.actual_hours-1,Math.floor(currentHours))],wind=row?Math.hypot(row.u,row.v):0,distance=row?Math.min(2,(row.distance_m||0)*.001)*.3:0;
  t=[facility.world_east_north_km[0]+(wind?row.u/wind*distance:0),row?s.base+Math.max(.15,(s.stack.height_AGL_m+row.final_height_m)*.0009):.2,-facility.world_east_north_km[1]-(wind?row.v/wind*distance:0)];p=[t[0]+1,t[1]+1.3,t[2]+2];}
 else if(which==='UBC'){const u=meta.crest?.world_east_north_km||[-21.937,-2.305];t=[u[0],.15,-u[1]];p=[t[0]+1.2,1.6,t[2]+2.5];}
 else if(which==='all'){const[x0,y0,x1,y1]=meta.display.bounds_east_north_km;t=[(x0+x1)/2,0,-(y0+y1)/2];p=[t[0]+15,43,t[2]+50];}
 else{const fs=meta.facilities||[],cx=fs.length?fs.reduce((a,b)=>a+b.world_east_north_km[0],0)/fs.length:-4,cy=fs.length?-fs.reduce((a,b)=>a+b.world_east_north_km[1],0)/fs.length:7;t=[cx,.1,cy];p=[cx+12,15,cy+20];}
 controls.target.fromArray(t);camera.position.fromArray(p);controls.update();clearProbe();
}
function makeTerrain(){
 const[,nz,ny,nx]=meta.display.shape_time_z_y_x_fields,[x0,y0,x1,y1]=meta.display.bounds_east_north_km;
 const vertices=[],colours=[],indices=[],water=new THREE.Color('#76adba'),land=new THREE.Color('#e2e8cd');
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const h=terrain[y*nx+x];vertices.push(x0+(x1-x0)*x/(nx-1),h*.001*1.8,-(y0+(y1-y0)*y/(ny-1)));const c=h<.5?water:land;colours.push(c.r,c.g,c.b);}
 const hole=meta.scene_terrain_hole_bounds;
 for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
  const east=x0+(x1-x0)*(x+.5)/(nx-1),north=y0+(y1-y0)*(y+.5)/(ny-1);
  if(hole&&east>hole[0]&&east<hole[2]&&north>hole[1]&&north<hole[3])continue;
  const a=x+nx*y,b=a+1,c=a+nx,d=c+1;indices.push(a,c,b,b,c,d);
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));geo.setIndex(indices);geo.computeVertexNormals();
 const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:4,polygonOffsetUnits:4}));mesh.name='Actual terrain display, not modified weather';scene.add(mesh);
}
async function makeCrest(){
 const c=meta.crest;if(!c?.positions||!c.texture)return;
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(c.positions.flat(),3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(c.uv.flat(),2));geo.setIndex(c.indices.flat());
 const texture=await new THREE.TextureLoader().loadAsync(c.texture);texture.colorSpace=THREE.SRGBColorSpace;
 if(c.texture_offset)texture.offset.fromArray(c.texture_offset);if(c.texture_repeat)texture.repeat.fromArray(c.texture_repeat);
 crest=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.01,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));crest.name='UBC geographic crest, ground decal';crest.renderOrder=2;scene.add(crest);
}
async function makeContextTerrain(){
 const c=meta.context_terrain;if(!c){makeTerrain();return;}
 const a=new Float32Array(await bytes('./data/'+c.file)),[ny,nx,nf]=c.shape_y_x_fields,positions=[],colours=[],indices=[],hole=meta.scene_terrain_hole_bounds;
 if(nf!==4||a.length!==ny*nx*nf)throw Error('Context terrain shape mismatch');
 const water=new THREE.Color('#76adba'),low=new THREE.Color('#e2e8cd'),high=new THREE.Color('#759a7c');
 for(let i=0;i<ny*nx;i++){const h=Math.max(0,a[i*4+2]);positions.push(a[i*4],h*.001*1.8,-a[i*4+1]);const colour=a[i*4+3]<.5?water:low.clone().lerp(high,Math.min(1,h/800));colours.push(colour.r,colour.g,colour.b);}
 function emit(polygon){if(polygon.length<3)return;const base=positions.length/3;for(const p of polygon){positions.push(...p.slice(0,3));colours.push(...p.slice(3));}for(let i=1;i<polygon.length-1;i++)indices.push(base,base+i,base+i+1);}
 function triangle(ids){
  const p=ids.map(i=>[...positions.slice(i*3,i*3+3),...colours.slice(i*3,i*3+3)]);
  if(!hole||Math.max(...p.map(v=>v[0]))<hole[0]||Math.min(...p.map(v=>v[0]))>hole[2]||Math.max(...p.map(v=>-v[2]))<hole[1]||Math.min(...p.map(v=>-v[2]))>hole[3]){indices.push(...ids);return;}
  let remaining=p;
  // Exact geometric clipping keeps the coarse parent grid outside the detailed
  // rectangle. Center-cell omission would leave kilometre-wide blank strips.
  for(const distance of [v=>v[0]-hole[0],v=>hole[2]-v[0],v=>-v[2]-hole[1],v=>hole[3]+v[2]]){
   if(!remaining.length)break;const inside=[],outside=[];
   for(let i=0;i<remaining.length;i++){const u=remaining[i],v=remaining[(i+1)%remaining.length],du=distance(u),dv=distance(v);(du>=0?inside:outside).push(u);if((du>=0)!==(dv>=0)){const w=u.map((q,j)=>q+(v[j]-q)*du/(du-dv));inside.push(w);outside.push(w);}}
   emit(outside);remaining=inside;
  }
 }
 for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){const k=y*nx+x;triangle([k,k+nx,k+1]);triangle([k+1,k+nx,k+nx+1]);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));geo.setIndex(indices);geo.computeVertexNormals();
 const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:4,polygonOffsetUnits:4}));mesh.name='Frozen parent HGT LANDMASK outer context, display only';scene.add(mesh);
}
async function queryGround(world){
 if(referenceMode){const q=initialReference.query(world);if(!q)return null;marker.position.copy(world);marker.visible=true;window.MONTH_CLIMATE.lastProbe=q;$('inspector').hidden=false;$('probe').innerHTML=`<strong>${formatPpb(q.ppb)}</strong> ppb<br>NASA initial near-surface reference<div class="secondary">Interpolated original model field · no particle reconstruction<br>${formatUTC(initialTime())}<br>Not the evolving 15-day background</div>`;return q;}
 const q=await queryNative(world,currentHours);if(!q){clearProbe();$('probe').textContent='Outside the computed space or time range';return null;}
 marker.position.copy(world);marker.visible=true;window.MONTH_CLIMATE.lastProbe=q;$('inspector').hidden=false;
 const avg=q.mean24h_ppb===null?'Less than 24 h':formatPpb(q.mean24h_ppb)+' ppb';
 const zeroNote=q.concentration_ppb===0?'<br>Zero in this hourly layer; earlier impact may remain.':'';
 $('probe').innerHTML=`<strong>${formatPpb(q.selected_source_ppb)}</strong> ppb<br>Native surface 0–20 m · source increment<div class="secondary">24 h mean ${avg}<br>15-day mean ${formatPpb(q.month_mean_source_ppb)} ppb<br>Dry / wet deposition ${(q.drydep_cumulative_kg_m2*1e6).toPrecision(3)} / ${(q.wetdep_cumulative_kg_m2*1e6).toPrecision(3)} mg/m²${zeroNote}<br>Evolving background excluded<br><a href="../results/#ground-zero" target="_blank" rel="noopener">Understanding surface zeros ↗</a></div>`;
 return q;
}
function sampleDisplay(p){
 if(!currentPair.length)return null;
 const [x0,y0,x1,y1]=meta.display.bounds_east_north_km,[,nz,ny,nx]=meta.display.shape_time_z_y_x_fields;
 const x=(p.x-x0)/(x1-x0)*(nx-1),y=(-p.z-y0)/(y1-y0)*(ny-1);if(x<0||y<0||x>nx-1||y>ny-1)return null;
 const ix=Math.min(nx-2,Math.floor(x)),iy=Math.min(ny-2,Math.floor(y)),wx=x-ix,wy=y-iy;
 let h=0;for(let j=0;j<2;j++)for(let i=0;i<2;i++)h+=terrain[(iy+j)*nx+ix+i]*(i?wx:1-wx)*(j?wy:1-wy);
 const agl=p.y/1.8*1000-h,heights=meta.display.height_centers_AGL_m;if(agl<0||agl>meta.display.height_tops_AGL_m.at(-1))return null;
 let z=0;while(z<nz-1&&agl>=heights[z+1])z++;const next=Math.min(nz-1,z+1),wz=next===z?0:Math.max(0,(agl-heights[z])/(heights[next]-heights[z]));
 const mode=Number(material.uniforms.contribution.value),tw=material.uniforms.timeWeight.value;
 function field(entry){let c=0;for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++){
  const index=(((k?next:z)*ny+iy+j)*nx+ix+i)*2,base=entry.reference?0:(entry.index-entry.chunk.first_index)*frameSize();
  const s=entry.reference?entry.values[index]:lookups.source_ppb.values[entry.packed[base+index]],b=entry.reference?entry.values[index+1]:lookups.initial_ppb.values[entry.packed[base+index+1]];
  c+=(mode===0?s+b:mode===1?s:b)*(i?wx:1-wx)*(j?wy:1-wy)*(k?wz:1-wz);
 }return c;}
 return{ppb:field(currentPair[0])*(1-tw)+field(currentPair[1])*tw,AGL_m:agl,display_approximation:true,simulation_hours:currentHours};
}
let down;canvas.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
canvas.addEventListener('pointerup',e=>{
 if(!ready||e.button!==0||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>4)return;stop();
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),camera);
 const hit=ray.intersectObjects(scene.children,true).find(h=>h.object.isMesh&&h.object!==marker&&h.object!==crest&&!h.object.userData.nonQuery);
 if($('probeMode').value==='ground'){if(hit)queryGround(hit.point).catch(fail);return;}
 const box=new THREE.Box3(material.uniforms.lo.value,material.uniforms.hi.value),entry=ray.ray.intersectBox(box,new THREE.Vector3());if(!entry)return;
 const start=box.containsPoint(camera.position)?0:entry.distanceTo(camera.position),end=hit?hit.distance:180;let best=null,bp;
 for(let d=start;d<end;d+=.04){const p=ray.ray.at(d,new THREE.Vector3());if(!box.containsPoint(p))continue;const q=sampleDisplay(p);if(q&&(!best||q.ppb>best.ppb)){best=q;bp=p.clone();}}
 if(best&&best.ppb>0){marker.position.copy(bp);marker.visible=true;window.MONTH_CLIMATE.lastProbe=best;$('inspector').hidden=false;$('probe').innerHTML=`<strong>${formatPpb(best.ppb)}</strong> ppb<br>Display approximation · AGL ${best.AGL_m.toFixed(1)} m<br>Use surface mode for native ground values`;}
 else{clearProbe();$('probe').textContent='No contribution along this view';}
});
function fail(error){console.error(error);stop();$('error').hidden=false;$('error').textContent='Loading failed: '+error.message;$('loading').style.display='none';}
function controlsUI(){
 $('settings').onclick=()=>{const open=$('settingsPanel').hidden;$('settingsPanel').hidden=!open;$('settings').setAttribute('aria-expanded',String(open));};$('closeSettings').onclick=()=>{$('settingsPanel').hidden=true;$('settings').setAttribute('aria-expanded','false');};
 $('aboutOpen').onclick=()=>$('about').showModal();$('aboutClose').onclick=()=>$('about').close();$('fullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
 $('play').onclick=()=>play().catch(fail);$('timeline').oninput=()=>{stop();setHours(Number($('timeline').value)).catch(fail);};$('duration').oninput=()=>{duration=Number($('duration').value);$('durationValue').textContent=duration+' s';const value=String(15/duration);$('rate').value=[...$('rate').options].some(o=>Number(o.value)===15/duration)?[...$('rate').options].find(o=>Number(o.value)===15/duration).value:'custom';startHours=currentHours;playStart=performance.now();};
 $('rate').onchange=()=>{duration=15/Number($('rate').value);$('duration').value=duration;$('durationValue').textContent=duration+' s';startHours=currentHours;playStart=performance.now();};
 $('contribution').onchange=async()=>{stop();referenceMode=$('contribution').value==='reference';for(const id of ['timeline','play','rate'])$(id).disabled=referenceMode;
  if(referenceMode){savedSourceHours=currentHours;currentHours=0;const r=initialReference.entry;material.uniforms.field0.value=material.uniforms.field1.value=r.texture;material.uniforms.timeWeight.value=0;material.uniforms.contribution.value=2;currentPair=[r,r];clock(true);}
  else{material.uniforms.contribution.value=1;await setHours(savedSourceHours);}
  material.uniforms.gain.value=Number($('gain').value)*(referenceMode?.08:1);weather.objects.rain.visible=!referenceMode;clearProbe();};
 $('gain').oninput=()=>{material.uniforms.gain.value=Number($('gain').value)*(referenceMode?.08:1);$('gainValue').textContent=Number($('gain').value).toFixed(2)+'×';};$('smoke').onchange=()=>material.uniforms.enabled.value=$('smoke').checked?1:0;
 function changeColour(){const hex=$('colour').value;material.uniforms.pigment.value.set(...[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));}
 $('colour').oninput=changeColour;$('resetColour').onclick=()=>{$('colour').value='#777d82';changeColour();};$('crest').onchange=()=>{if(crest)crest.visible=$('crest').checked;};$('probeMode').onchange=clearProbe;
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));$('save').onclick=()=>{const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='Vancouver_SO2_360h.png';a.click();};
}
async function init(){
 try{
  const response=await fetch('./data/metadata.json?rev=en-source-r02');if(!response.ok)throw Error('Complete 15-day data unavailable');meta=await response.json();
  const engineering=new URLSearchParams(location.search).get('engineering')==='1';
  if(!engineering&&(!meta.scientific_period_complete||meta.actual_hours!==360))throw Error('Production requires all 360 actual hours');
  if(engineering){$('caseTag').textContent=`Engineering input ${meta.actual_hours} h · not a production forecast`;document.querySelector('.brand h1').firstChild.textContent='Engineering preview';}
  else $('caseTag').textContent='15-day source increment · not ambient total';
  const [,nz,ny,nx]=meta.display.shape_time_z_y_x_fields;if(nz!==16)throw Error('All 16 actual vertical layers are required');
  terrain=new Float32Array(await bytes('./data/'+meta.display.terrain_file));const mask=new Uint8Array(await bytes('./data/'+meta.display.coverage_file));coverage=Float32Array.from(mask);
  if(terrain.length!==ny*nx||coverage.length!==ny*nx)throw Error('Terrain/display shape mismatch');
  lookups=Object.fromEntries(meta.display.fields.map(k=>[k,makeScalarLookup(meta.display.quantizers[k])]));
  async function ground(chunk){if(!groundBlocks.has(chunk.file))groundBlocks.set(chunk.file,bytes('./data/'+chunk.file).then(b=>new Float32Array(b)));return groundBlocks.get(chunk.file);}
  queryNative=createMonthQuery(meta,ground,chunk=>bytes('./data/'+chunk.file).then(b=>new Float32Array(b)),worldLonLat);
  const draco=new DRACOLoader().setDecoderPath('../vendor/draco/').setWorkerLimit(2),loader=new GLTFLoader().setDRACOLoader(draco);
  $('loadingText').textContent='Loading city geometry…';const city=await loader.parseAsync(await bytes('../city-draco.glb.gz'),new URL('../',location.href).href);draco.dispose();
  colourLandmarks(city.scene);city.scene.traverse(o=>{if(/^Diorama[ _]base/.test(o.name))o.visible=false;});scene.add(city.scene);await makeContextTerrain();await makeCrest();
  weather=await createWeatherEffects(scene,city.scene,meta,bytes,{overlay:volumeScene,depthTexture:target.depthTexture,renderer,sampleConcentration:sampleDisplay});
  // Background reference is deferred; no extra background asset is loaded.
  const [x0,y0,x1,y1]=meta.display.bounds_east_north_km,lo=new THREE.Vector3(x0,0,-y1),hi=new THREE.Vector3(x1,(Math.max(...terrain)+meta.display.height_tops_AGL_m.at(-1))*.001*1.8,-y0),span=hi.clone().sub(lo);
  function texture(a){const t=new THREE.DataTexture(a,nx,ny,THREE.RedFormat,THREE.FloatType);t.minFilter=t.magFilter=THREE.LinearFilter;t.needsUpdate=true;return t;}
  material=new THREE.ShaderMaterial({vertexShader:monthShader.vertex,fragmentShader:monthShader.fragment,glslVersion:THREE.GLSL3,transparent:true,depthTest:false,depthWrite:false,side:THREE.BackSide,
   uniforms:{field0:{value:null},field1:{value:null},terrain:{value:texture(terrain)},coverage:{value:texture(coverage)},depthMap:{value:target.depthTexture},lo:{value:lo},hi:{value:hi},horizontalShape:{value:new THREE.Vector2(nx,ny)},eye:{value:camera.position},resolution:{value:renderer.getDrawingBufferSize(new THREE.Vector2())},inverseVP:{value:new THREE.Matrix4()},heights:{value:meta.display.height_centers_AGL_m},topAGL:{value:meta.display.height_tops_AGL_m.at(-1)},timeWeight:{value:0},gain:{value:.35},enabled:{value:1},contribution:{value:1},raySteps:{value:144},pigment:{value:new THREE.Vector3(.467,.490,.510)}}});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(span.x,span.y,span.z),material);mesh.position.copy(lo).addScaledVector(span,.5);volumeScene.add(mesh);
  marker=new THREE.Mesh(new THREE.SphereGeometry(.045,12,8),new THREE.MeshBasicMaterial({color:'#d5a85e',depthTest:false}));marker.visible=false;marker.renderOrder=4;scene.add(marker);
  $('timeline').max=meta.actual_hours;$('startLabel').textContent=formatUTC(initialTime());$('endLabel').textContent=formatUTC(initialTime()+meta.actual_hours*3600000);$('periodLabel').textContent=`${meta.actual_hours}h → 15 s`;$('aboutScope').textContent=`Actual ${meta.actual_hours} continuous hourly means, 16 layers. Only selected-source increments are shown.${engineering?'Engineering input only.':'The full 360 hours play in 15 seconds by default.'}`;
  controlsUI();await setHours(0);view('FCC');ready=true;
  window.MONTH_CLIMATE={ready:true,meta,scene,camera,controls,renderer,material,weather,initialReference,setHours,queryGround,sampleDisplay,view,play,stop,lastProbe:null,get hours(){return currentHours;},get playback(){return{playing,duration,preparing};},get currentPair(){return currentPair;},get performance(){return{frame_ms:frameEMA,renderScale,raySteps:material.uniforms.raySteps.value};}};
  $('loading').style.display='none';$('status').textContent=`${meta.actual_hours} actual hours · 16 layers · native surface query`;
 }catch(error){fail(error);}
}
function animate(now){
 requestAnimationFrame(animate);controls.update();
 if(lastFrame){const dt=now-lastFrame;if(dt<200)frameEMA=frameEMA*.95+dt*.05;}lastFrame=now;
 if(ready&&++perfFrames%120===0){const desired=frameEMA>30?Math.max(.65,renderScale-.1):frameEMA<19?Math.min(1,renderScale+.05):renderScale;if(desired!==renderScale){renderScale=desired;renderer.setPixelRatio(Math.min(devicePixelRatio,renderScale));resize();}}
 if(ready&&playing){const h=Math.min(meta.actual_hours,startHours+(now-playStart)/1000*meta.actual_hours/duration),i=indices(h),a=frameFromLoaded(i.a),b=frameFromLoaded(i.b);if(a&&b)commit(h,a,b,i.weight);if(h>=meta.actual_hours)stop();}
 camera.near=Math.max(.004,Math.min(.15,camera.position.distanceTo(controls.target)*.001));camera.updateProjectionMatrix();
 if(ready){weather.update(currentHours,now*.001,camera,controls.target,material.uniforms.contribution.value,new THREE.Color().setRGB(...material.uniforms.pigment.value.toArray()),15/duration,material.uniforms.gain.value);if(perfFrames%30===0)$('weatherValue').textContent=`At view centre ${weather.state.rain_mm_h.toFixed(2)} mm/h`;}
 renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.clear();renderer.render(copyScene,copyCamera);
 if(ready){material.uniforms.inverseVP.value.multiplyMatrices(camera.matrixWorld,camera.projectionMatrixInverse);renderer.autoClear=false;renderer.render(volumeScene,camera);renderer.autoClear=true;}
}
requestAnimationFrame(animate);init();
