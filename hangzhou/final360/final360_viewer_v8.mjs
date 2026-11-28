import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {loadFinal360FieldData} from './field_data_v8.mjs';
import {loadActualModelTerrainV8} from './model_terrain_v8.mjs';
import {addActualCityContextV8} from './city_context_v8.mjs';
import {loadActualWeatherV8} from './weather_data_v8.mjs';
import {createActualPlumeVolume} from './plume_geometry_volume_v8.mjs';
import {makeFinal360VolumeShader} from './volume_shader_v8.mjs';
import {createActualWeatherEffectsV8,weatherAndSO2Composite} from './weather_effects_v8.mjs';

// This viewer never runs, alters or substitutes the scientific calculation.
const $=id=>document.getElementById(id),canvas=$('scene'),verticalScale=1.8;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color('#edf2ef');
scene.add(new THREE.HemisphereLight('#ffffff','#a3b4aa',1.1));
const sun=new THREE.DirectionalLight('#fff7ed',1.25);sun.position.set(-12,25,8);scene.add(sun);
const opticalScene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.001,2000);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.09;controls.maxPolarAngle=Math.PI*.49;
const opaqueTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});opaqueTarget.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
const opticalTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
const shared={eye:{value:new THREE.Vector3()},resolution:{value:new THREE.Vector2()},inverseVP:{value:new THREE.Matrix4()},depthMap:{value:opaqueTarget.depthTexture},gain:{value:.12}};
const compositeScene=new THREE.Scene(),screenCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const compositeMaterial=new THREE.ShaderMaterial({vertexShader:weatherAndSO2Composite.vertex,fragmentShader:weatherAndSO2Composite.fragment,depthTest:false,depthWrite:false,
 uniforms:{opaqueImage:{value:opaqueTarget.texture},opticalDepth:{value:opticalTarget.texture},pigment:{value:new THREE.Color('#174b75')},cloudPigment:{value:new THREE.Color('#a6b2bc')}}});
compositeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),compositeMaterial));
let meta,provider,terrain,city,weather,effects,plume,material,volumeBox,sources,hours=.5,ready=false,playing=false,startHours=0,startTime=0,pending=null,setting=null,selected=0;
const textureCache=new Map(),shaderErrors=[],selectionNames=['total','documented_stack','distributed','regional_stack','near_plume','pending_sync'];
renderer.debug.onShaderError=(gl,p,v,f)=>shaderErrors.push({program:gl.getProgramInfoLog(p),vertex:gl.getShaderInfoLog(v),fragment:gl.getShaderInfoLog(f)});
const world=(lon,lat)=>[(lon-meta.origin_lon_lat[0])*meta.km_per_degree[0],(lat-meta.origin_lon_lat[1])*meta.km_per_degree[1]];
const geographic=p=>({lon:p.x/meta.km_per_degree[0]+meta.origin_lon_lat[0],lat:-p.z/meta.km_per_degree[1]+meta.origin_lon_lat[1]});
function resize(width=innerWidth,height=innerHeight,ratio=Number($('quality').value)){
 renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
 const size=renderer.getDrawingBufferSize(new THREE.Vector2());opaqueTarget.setSize(size.x,size.y);opticalTarget.setSize(size.x,size.y);shared.resolution.value.copy(size);
}
function render(){
 if(!ready)return;controls.update();city?.update(camera,controls);effects.update(performance.now()*.001,camera,controls.target);
 camera.updateMatrixWorld();shared.eye.value.copy(camera.position);shared.inverseVP.value.multiplyMatrices(camera.matrixWorld,camera.projectionMatrixInverse);
 renderer.setRenderTarget(opaqueTarget);renderer.render(scene,camera);
 renderer.setRenderTarget(opticalTarget);renderer.setClearColor(0,0);renderer.clear();renderer.render(opticalScene,camera);
 renderer.setRenderTarget(null);renderer.render(compositeScene,screenCamera);
}
function sourceView(index=selected,range=.65){
 selected=index;const s=sources[index],[x,n]=world(s.lon,s.lat),top=(s.model_source_base_MSL_m+s.height_agl_m)*verticalScale*.001;
 controls.target.set(x,top,-n);camera.position.set(x+range*.7,top+range*.42,-n+range*.85);controls.update();
}
function view(kind='outlet'){
 if(kind==='outlet')sourceView();else{
  const b=kind==='city'?city.context.landcover.bbox:[provider.geometry.lon_interface[0],provider.geometry.lat_interface[0],provider.geometry.lon_interface.at(-1),provider.geometry.lat_interface.at(-1)];
  const [x,n]=world((b[0]+b[2])/2,(b[1]+b[3])/2),span=Math.max((b[2]-b[0])*meta.km_per_degree[0],(b[3]-b[1])*meta.km_per_degree[1]);
  controls.target.set(x,.15,-n);camera.position.set(x+span*.22,span*.65,-n+span*.7);controls.update();
 }render();
}
function buildOutlets(){
 const metal=new THREE.MeshStandardMaterial({color:'#8a8278',roughness:.75}),lip=new THREE.MeshStandardMaterial({color:'#59656a',roughness:.7});
 sources.forEach((s,i)=>{
  const [x,n]=world(s.lon,s.lat),height=s.height_agl_m*.001*verticalScale,radius=Number(s.diameter_m)*.0005,base=s.model_source_base_MSL_m*.001*verticalScale;
  const pipe=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,32,1,true),metal);pipe.position.set(x,base+height/2,-n);pipe.name=s.id+' · actual documented outlet';scene.add(pipe);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,radius*.12,8,32),lip);ring.rotation.x=Math.PI/2;ring.position.set(x,base+height,-n);scene.add(ring);
  const option=document.createElement('option');option.value=i;option.textContent=s.id;$('source').append(option);
 });
}
function fieldTexture(index){if(!textureCache.has(index)){const t=provider.texture(index);renderer.initTexture(t);textureCache.set(index,t);}return textureCache.get(index);}
function commit(h){
 const t=provider.time(h);for(const[name,index]of [['previousField',t.p],['field0',t.a],['field1',t.b],['followingField',t.n]])material.uniforms[name].value=fieldTexture(index);
 const keep=new Set([t.p,t.a,t.b,t.n]);for(const[i,t]of textureCache)if(!keep.has(i)){t.dispose();textureCache.delete(i);}
 material.uniforms.timeWeight.value=t.weight;plume.commit(h);effects.commit(h);
 if(h!==hours){$('probe').hidden=true;if(window.HANGZHOU)window.HANGZHOU.lastProbe=null;}
 hours=h;
 $('time').value=h;$('clock').textContent=`${h.toFixed(1)} / 360 h · ${new Date(Date.parse(meta.report_start_UTC)+h*3600000).toISOString().slice(0,16).replace('T',' ')} UTC`;
 if(window.HANGZHOU)window.HANGZHOU.hours=h;
}
function setHours(value){
 if(!Number.isFinite(value)||value<0||value>360)return Promise.reject(Error('Reporting time outside [0,360]'));
 pending=value;if(setting)return setting;
 setting=(async()=>{try{while(pending!==null){const h=pending;pending=null;await Promise.all([provider.ensure(h),plume.prepare(h),effects.prepare(h)]);commit(h);}}finally{setting=null;}})();return setting;
}
function contribution(){const name=$('contribution').value;material.uniforms.contribution.value=selectionNames.indexOf(name);plume.setEnabled($('visible').checked&&['total','documented_stack','near_plume'].includes(name));material.uniforms.enabled.value=$('visible').checked?1:0;}
async function nativeSample(lon,lat,agl=0,h=hours,field=$('contribution').value){
 h=Math.min(360-Number.EPSILON*360,h);
 const names=field==='documented_stack'?['regional_stack','near_plume','pending_sync']:field==='distributed'?['regional_distributed']:[field];
 const samples=await Promise.all(names.map(name=>provider.native.query({lon,lat,agl_m:agl,report_hour:h,field:name})));
 if(samples.some(x=>!x))return null;
 return {...samples[0],value:samples.reduce((sum,x)=>sum+x.value,0),ug_m3:samples.reduce((sum,x)=>sum+x.ug_m3,0),component_fields:names,representation:'Original F64 native cell/hour mean; no display quantization.'};
}
async function groundMean(lon,lat,full=false){
 const q=await provider.native.query({lon,lat,report_hour:Math.min(hours,359.999),field:'ground_layer_0_25m'});if(!q)return null;
 const end=full?360:Math.min(360,Math.floor(hours));if(end===0)return null;
 const start=full?0:Math.max(0,end-24),index=q.native_cell.y*provider.native.meta.shape[3]+q.native_cell.x;let sum=0;
 for(let h=start;h<end;h++)sum+=(await provider.native.frame('ground_layer_0_25m',h))[index];
 return{...q,value:sum/(end-start),ug_m3:sum/(end-start)/1000,report_interval_h:[start,end],representation:'Arithmetic mean of original complete native 0–25 m hourly intervals.'};
}
async function deposition(lon,lat,full=false){
 const end=full?360:Math.min(360,Math.floor(hours));if(end===0)return null;const start=full?0:Math.max(0,end-24),rows={};
 for(const phase of ['dry','wet']){const a=await Promise.all(['stack','distributed'].map(label=>provider.native.depositionInterval({lon,lat,start_report_hour:start,end_report_hour:end,field:phase+'_'+label})));if(a.some(x=>!x))return null;rows[phase]={amount_kg_m2:a.reduce((s,x)=>s+x.amount_kg_m2,0),mean_flux_kg_m2_s:a.reduce((s,x)=>s+x.mean_flux_kg_m2_s,0)};}
 return{report_interval_h:[start,end],...rows,source_sha256:provider.native.meta.source_sha256,representation:'Original cumulative endpoint difference; report-start lead10 baseline retained.'};
}
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerDown;
function rayInterval(ray,box){let a=0,b=Infinity;for(const k of ['x','y','z']){if(Math.abs(ray.direction[k])<1e-14){if(ray.origin[k]<box.min[k]||ray.origin[k]>box.max[k])return null;continue;}const x=(box.min[k]-ray.origin[k])/ray.direction[k],y=(box.max[k]-ray.origin[k])/ray.direction[k];a=Math.max(a,Math.min(x,y));b=Math.min(b,Math.max(x,y));}return b>a?[a,b]:null;}
async function inspect(clientX,clientY){
 const rect=canvas.getBoundingClientRect();pointer.set((clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2);raycaster.setFromCamera(pointer,camera);
 const ray=raycaster.ray,groundHit=raycaster.intersectObject(terrain.mesh)[0],mode=$('query').value;let point=groundHit?.point,q;
 if(hours<1&&['ground24','deposition24'].includes(mode)){$('probe').hidden=false;$('probe').textContent='No complete preceding hourly interval yet. Select report hour 1 or later.';return null;}
 if(mode==='residence'){
  const hit=plume.pickRay(ray.origin,ray.direction,groundHit?.distance??Infinity);if(!hit)return null;point=hit.world_point_km;const p=geographic(point),msl=point.y*1000/verticalScale;q={...plume.sample(p.lon,p.lat,msl),longitude:p.lon,latitude:p.lat,height_MSL_m:msl};
  $('probe').textContent=`${q.value.toPrecision(6)} µg/m³\nIntegral-plume residence · ${msl.toFixed(2)} m MSL\n${p.lon.toFixed(6)}, ${p.lat.toFixed(6)}\nSeparate from the native regional cell/hour mean.`;
 }else{
  if(mode==='volume'){
   const interval=rayInterval(ray,volumeBox);if(!interval)return null;let best=0;point=null;const end=Math.min(interval[1],groundHit?.distance??Infinity);
   for(let i=0;i<512;i++){const at=ray.at(interval[0]+(i+.5)/512*(end-interval[0]),new THREE.Vector3()),p=geographic(at),g=terrain.height(p.lon,p.lat);if(g===null)continue;const c=provider.displayAt(p.lon,p.lat,at.y*1000/verticalScale-g,hours,$('contribution').value);if(c>best){best=c;point=at;}}
  }if(!point)return null;const p=geographic(point),base=await provider.native.query({lon:p.lon,lat:p.lat,report_hour:Math.min(hours,359.999),field:'ground_layer_0_25m'});if(!base)return null;
  const agl=mode==='volume'?Math.max(0,point.y*1000/verticalScale-base.terrain_m_MSL):0;
  if(mode.startsWith('deposition')){q=await deposition(p.lon,p.lat,mode==='deposition360');if(q)$('probe').textContent=`Deposition · ${q.report_interval_h.join('–')} h\nDry ${q.dry.amount_kg_m2.toExponential(5)} kg/m²\nWet ${q.wet.amount_kg_m2.toExponential(5)} kg/m²\nOriginal cumulative endpoints; no repeated summation.`;}
  else{q=mode.startsWith('ground')&&mode!=='ground'?await groundMean(p.lon,p.lat,mode==='ground360'):await nativeSample(p.lon,p.lat,agl);if(q)$('probe').textContent=`${q.ug_m3.toPrecision(6)} µg/m³\n${q.report_interval_h.join('–')} h · ${q.height_interval_m_AGL.join('–')} m AGL\nNative cell (${q.native_cell.x}, ${q.native_cell.y}${q.native_cell.z===null?'':', '+q.native_cell.z})\nOriginal F64 values; displayed colour is independent.`;}
  if(q)Object.assign(q,{longitude:p.lon,latitude:p.lat});
 }if(q){$('probe').hidden=false;window.HANGZHOU.lastProbe=q;}return q;
}
async function capture4K(){const aspect=camera.aspect;resize(3840,2160,1);render();const data=canvas.toDataURL('image/png');resize();camera.aspect=aspect;camera.updateProjectionMatrix();render();return data;}
async function startPlayback(){
 if(playing){playing=false;$('play').textContent='Play';return;}
 $('play').disabled=true;$('play').textContent='Loading scalar data…';
 try{await Promise.all([provider.preload(),plume.preload(),weather.preloadDisplay()]);if(hours>=360)await setHours(0);startHours=hours;startTime=performance.now();playing=true;$('play').textContent='Pause';}finally{$('play').disabled=false;}
}
function showError(error){playing=false;$('error').hidden=false;$('error').textContent=error.stack??String(error);console.error(error);}
async function init(){
 const r=await fetch('./viewer_metadata.json');if(!r.ok)throw Error('Final360 viewer metadata unavailable');meta=await r.json();if(meta.schema!=='hangzhou-v8-final360-viewer-v1'||meta.reporting_hours!==360)throw Error('Wrong final360 source');
 provider=await loadFinal360FieldData(meta);terrain=await loadActualModelTerrainV8(meta.terrain_metadata_url,{world,verticalScale,expectedTrace:meta.plume_trace_sha256});scene.add(terrain.mesh);
 city=await addActualCityContextV8({scene,metadataURL:meta.city_context_url,terrain,world,origin:meta.origin_lon_lat,kmPerDegree:meta.km_per_degree,verticalScale});
 weather=await loadActualWeatherV8(meta.weather_metadata_url,{expectedIntegritySHA256:meta.weather_integrity_sha256});
 const g=provider.geometry,[,nz,ny,nx]=provider.native.meta.shape,fieldLo=world(g.lon_interface[0],g.lat_interface[0]),fieldHi=world(g.lon_interface.at(-1),g.lat_interface.at(-1));
 const groundTexture=new THREE.DataTexture(Float32Array.from(g.terrain),nx,ny,THREE.RedFormat,THREE.FloatType);groundTexture.minFilter=groundTexture.magFilter=THREE.LinearFilter;groundTexture.unpackAlignment=1;groundTexture.needsUpdate=true;
 let low=Infinity,high=-Infinity;for(const h of g.terrain){low=Math.min(low,h);high=Math.max(high,h);}
 volumeBox=new THREE.Box3(new THREE.Vector3(fieldLo[0],low*verticalScale*.001,-fieldHi[1]),new THREE.Vector3(fieldHi[0],(high+g.height_interface.at(-1))*verticalScale*.001,-fieldLo[1]));
 const shader=makeFinal360VolumeShader({verticalScale,outputOpticalDepth:true});
 material=new THREE.ShaderMaterial({vertexShader:shader.vertex,fragmentShader:shader.fragment,glslVersion:THREE.GLSL3,side:THREE.BackSide,depthTest:false,depthWrite:false,transparent:true,
  blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,
  uniforms:{...shared,previousField:{value:null},field0:{value:null},field1:{value:null},followingField:{value:null},displayTerrain:{value:groundTexture},lo:{value:volumeBox.min},hi:{value:volumeBox.max},
  fieldLo:{value:new THREE.Vector2(...fieldLo)},fieldHi:{value:new THREE.Vector2(...fieldHi)},terrainLo:{value:new THREE.Vector2(...fieldLo)},terrainHi:{value:new THREE.Vector2(...fieldHi)},heights:{value:Array.from(g.height)},topAGL:{value:g.height_interface.at(-1)},timeWeight:{value:0},enabled:{value:1},contribution:{value:0},raySteps:{value:192},replaceCoarseNear:{value:1},pigment:compositeMaterial.uniforms.pigment}});
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...volumeBox.getSize(new THREE.Vector3()).toArray()),material);mesh.position.copy(volumeBox.getCenter(new THREE.Vector3()));mesh.frustumCulled=false;opticalScene.add(mesh);
 plume=await createActualPlumeVolume({metadataURL:meta.plume_metadata_url,expectedTrace:meta.plume_trace_sha256,world,scene:opticalScene,verticalScale,uniforms:shared});sources=plume.meta.sources;buildOutlets();
 const wg=await weather.ground(),b=wg.bounds_cell_edges_lon_lat;let weatherLow=Infinity,weatherHigh=-Infinity;for(const h of wg.values){weatherLow=Math.min(weatherLow,h);weatherHigh=Math.max(weatherHigh,h);}
 const weatherBox=new THREE.Box3(new THREE.Vector3(world(b[0],b[1])[0],weatherLow*verticalScale*.001,-world(b[2],b[3])[1]),new THREE.Vector3(world(b[2],b[3])[0],(weatherHigh+weather.meta.height_interface_AGL_m.at(-1))*verticalScale*.001,-world(b[0],b[1])[1]));
 effects=createActualWeatherEffectsV8({opaqueScene:scene,opticalScene,weather,world,groundTexture:wg.texture,groundBounds:[world(b[0],b[1]),world(b[2],b[3])],volumeBox:weatherBox,verticalScale,sharedUniforms:shared,displayGroundAtWorld:(x,n)=>terrain.height(x/meta.km_per_degree[0]+meta.origin_lon_lat[0],n/meta.km_per_degree[1]+meta.origin_lon_lat[1])});effects.cloudsVisible=false;
 await setHours(.5);sourceView(0);resize();ready=true;$('play').disabled=false;$('status').textContent='360 continuous hourly means · 15 native output layers · ground 0–25 m AGL';
 const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');window.HANGZHOU={ready,meta,provider,terrainData:terrain,cityGeography:city,weather,weatherEffects:effects,plume,scene,camera,controls,renderer,hours,shaderErrors,setHours,sample:nativeSample,groundMean,deposition,inspect,view,sourceView,capture4K,
  rendererInfo:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),sourceAlignment:terrain.sourceAlignment,
  playbackState:()=>({playing,hours,actual_elapsed_s:playing?(performance.now()-startTime)/1000:null,reference_duration_s:15,rate:Number($('speed').value)}),startPlayback};
 render();
}
$('settings').onclick=()=>{const open=$('panel').hidden;$('panel').hidden=!open;$('settings').setAttribute('aria-expanded',String(open));};$('close').onclick=()=>{$('panel').hidden=true;$('settings').setAttribute('aria-expanded','false');};
$('source').onchange=()=>{sourceView(Number($('source').value));render();};$('outlets').onclick=()=>view();$('city').onclick=()=>view('city');$('domain').onclick=()=>view('domain');
$('contribution').onchange=contribution;$('visible').onchange=contribution;$('gain').oninput=()=>{shared.gain.value=Number($('gain').value);};$('pigment').oninput=()=>compositeMaterial.uniforms.pigment.value.set($('pigment').value);
$('clouds').onchange=()=>{effects.cloudsVisible=$('clouds').checked;};$('rain').onchange=()=>{effects.rainVisible=$('rain').checked;};$('quality').onchange=()=>resize();
$('play').onclick=()=>startPlayback().catch(showError);$('time').oninput=()=>{playing=false;$('play').textContent='Play';setHours(Number($('time').value)).catch(showError);};$('speed').onchange=()=>{startHours=hours;startTime=performance.now();};
$('save').onclick=async()=>{try{const a=document.createElement('a');a.href=await capture4K();a.download=`Hangzhou_360h_${hours.toFixed(2)}h_4K.png`;a.click();}catch(e){showError(e);}};
$('wind').onclick=async()=>{try{const s=sources[selected],rows=await Promise.all([12.5,1100,6000].map(z=>weather.sample(s.lon,s.lat,z,hours)));$('probe').hidden=false;$('probe').textContent='Actual weather diagnostic · east / north / up m/s\n'+rows.map((q,i)=>`${[12.5,1100,6000][i]} m AGL: ${q.wind_east_north_up_m_s.map(x=>x.toFixed(3)).join(' / ')}`).join('\n')+'\nHeight-dependent frozen wind; display interpolation.';}catch(e){showError(e);}};
canvas.addEventListener('pointerdown',e=>{pointerDown=[e.clientX,e.clientY];});canvas.addEventListener('pointerup',e=>{if(ready&&pointerDown&&Math.hypot(e.clientX-pointerDown[0],e.clientY-pointerDown[1])<4){window.HANGZHOU.lastInspectionComplete=false;inspect(e.clientX,e.clientY).catch(showError).finally(()=>{window.HANGZHOU.lastInspectionComplete=true;});}});
addEventListener('resize',()=>resize());
function animate(now){requestAnimationFrame(animate);if(ready&&playing){const h=Math.min(360,startHours+(now-startTime)/1000*24*Number($('speed').value));setHours(h).catch(showError);if(hours>=360){playing=false;$('play').textContent='Play';}}render();}
requestAnimationFrame(animate);init().catch(showError);
