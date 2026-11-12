import {VERTICAL_SCALE,AGL_SCALE} from './display_geometry.mjs?v=mountain1km-r06';
import * as THREE from 'three';


// Rain glyphs and reported open-stack geometry. They do not add SO2 mass or alter
// native concentration/ground queries. All intensities and source paths use
// the actual frozen weather / wet removal / reported stack parameters.
export async function createWeatherEffects(scene,city,meta,bytes,sourceOptions){
 const wm=await(await fetch('./data/weather/metadata.json?rev=mountain1km-r06',{cache:'no-cache'})).json();
 const sourceData=await(await fetch('./data/weather/sources.json?rev=mountain1km-r06',{cache:'no-cache'})).json();
 const [nt,ny,nx,nf]=wm.shape_time_y_x_fields,cache=new Map(),textures=new Map();
 const [x0,y0,x1,y1]=wm.bounds_east_north_km;
 async function load(index){
  const c=wm.chunks.find(c=>index>=c.first_index&&index<c.first_index+c.count);if(!c)throw Error('Missing actual weather hour');
  if(!cache.has(c.file))cache.set(c.file,bytes('./data/weather/'+c.file).then(b=>new Float32Array(b)));
  await cache.get(c.file);
 }
 async function preload(){let next=0;await Promise.all(Array.from({length:3},async()=>{while(next<wm.chunks.length)await load(wm.chunks[next++].first_index);}));}
 function frame(index){const c=wm.chunks.find(c=>index>=c.first_index&&index<c.first_index+c.count),a=c?.values;return a?{a,offset:(index-c.first_index)*ny*nx*nf}:null;}
 async function prepare(index){await load(index);const c=wm.chunks.find(c=>index>=c.first_index&&index<c.first_index+c.count);c.values=await cache.get(c.file);}
 async function prepareAll(){await preload();for(const c of wm.chunks)c.values=await cache.get(c.file);}
 function texture(index,protectedIndices,contribution){
  const key=index+':'+contribution;if(textures.has(key))return textures.get(key);
  const f=frame(index);if(!f)return null;const a=new Float32Array(ny*nx*4);
  for(let i=0;i<ny*nx;i++){const k=f.offset+i*nf;a[i*4]=f.a[k];a[i*4+1]=f.a[k+1];const initial=nf>7?f.a[k+7]:0;a[i*4+2]=contribution===0?f.a[k+4]+initial:contribution===2?initial:f.a[k+4];a[i*4+3]=f.a[k+5];}
  const t=new THREE.DataTexture(a,nx,ny,THREE.RGBAFormat,THREE.FloatType);t.minFilter=t.magFilter=THREE.LinearFilter;t.needsUpdate=true;textures.set(key,t);
  for(const [j,old]of textures)if(textures.size>4&&j!==key&&(!protectedIndices.includes(Number(j.split(':')[0]))||!j.endsWith(':'+contribution))){old.dispose();textures.delete(j);break;}
  return t;
 }
 function sample(index,x,z,field){
  const f=frame(index);if(!f)return 0;const u=(x-x0)/(x1-x0)*(nx-1),v=(-z-y0)/(y1-y0)*(ny-1);
  if(u<0||u>nx-1||v<0||v>ny-1)return 0;
  const i=Math.min(nx-2,Math.floor(u)),j=Math.min(ny-2,Math.floor(v)),a=u-i,b=v-j;
  let sum=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)sum+=f.a[f.offset+((j+dy)*nx+i+dx)*nf+field]*(dx?a:1-a)*(dy?b:1-b);return sum;
 }
 const count=2000,seeds=new Float32Array(count*2*4),ends=new Float32Array(count*2);
 for(let i=0;i<count;i++)for(let j=0;j<2;j++){const k=i*2+j;seeds.set([(i*.61803398875)%1,(i*.41421356237)%1,(i*.73205080757)%1,(i*.2360679775)%1],k*4);ends[k]=j;}
 const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(count*2*3),3));rg.setAttribute('seed',new THREE.BufferAttribute(seeds,4));rg.setAttribute('end',new THREE.BufferAttribute(ends,1));
 const rm=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{weather0:{value:null},weather1:{value:null},weight:{value:0},clock:{value:0},anchor:{value:new THREE.Vector2()},radius:{value:5},bounds:{value:new THREE.Vector4(x0,y0,x1,y1)},pigment:{value:new THREE.Color('#777d82')}},
  vertexShader:`attribute vec4 seed;attribute float end;uniform sampler2D weather0,weather1;uniform float weight,clock,radius;uniform vec2 anchor;uniform vec4 bounds;varying float opacity;varying float wash;
  void main(){vec2 xz=anchor+(seed.xy-.5)*radius*2.;vec2 uv=vec2((xz.x-bounds.x)/(bounds.z-bounds.x),(-xz.y-bounds.y)/(bounds.w-bounds.y));vec4 w=mix(texture2D(weather0,uv),texture2D(weather1,uv),weight);float frozen=clamp(w.g/max(w.r,.000001),0.,1.);float phase=fract(seed.z-clock*mix(.045,.012,frozen));float h=.02+phase*.30+end*mix(.014,.002,frozen);vec3 p=vec3(xz.x,w.a*.001*${VERTICAL_SCALE.toFixed(1)}+h,xz.y);opacity=(1.-exp(-max(w.r,0.)*.65))*.62;opacity*=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);wash=1.-exp(-max(w.b,0.)*150.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
  fragmentShader:`uniform vec3 pigment;varying float opacity;varying float wash;void main(){if(opacity<.002)discard;gl_FragColor=vec4(mix(vec3(.37,.51,.62),pigment,wash*.85),opacity);}`});
 const rain=new THREE.LineSegments(rg,rm);rain.frustumCulled=false;rain.name='Actual hourly precipitation and selected-source wet-removal glyphs';rain.userData.nonQuery=true;scene.add(rain);
 const sources=sourceData.sources.map(original=>{
  const s={...original},actual=sourceOptions.actualOutlets.find(g=>g.group===s.group);if(actual)s.world_east_north_km=actual.center_world_east_north_km;
  const industrial=city.getObjectByName('Industrial_NPRI_'+s.npri)||city.getObjectByName('Industrial NPRI_'+s.npri);const base=sourceOptions.sampleGround(s.world_east_north_km[0],s.world_east_north_km[1])*.001*VERTICAL_SCALE;
  const p=[s.world_east_north_km[0],base,-s.world_east_north_km[1]];
  const h=s.stack.height_AGL_m*.001*AGL_SCALE;
  const stack=new THREE.Mesh(new THREE.CylinderGeometry(s.stack.diameter_m*.0005,s.stack.diameter_m*.0005,h,32,1,true),new THREE.MeshStandardMaterial({color:'#8d8a7b',roughness:.9,side:THREE.DoubleSide}));stack.position.set(p[0],base+h/2,p[2]);stack.name=s.id+' reported-position stack schematic';scene.add(stack);
  const cap=new THREE.Mesh(new THREE.TorusGeometry(s.stack.diameter_m*.00048,s.stack.diameter_m*.00003,8,32),new THREE.MeshBasicMaterial({color:'#be9460'}));cap.rotation.x=Math.PI/2;cap.position.set(p[0],base+h,p[2]);cap.userData.nonQuery=true;scene.add(cap);
  return{...s,base,cap};
 });
 const emit=new THREE.Group();emit.name='Open outlets; concentration is sampled from actual3D fields';let last={rain_mm_h:0,wet_mg_m2_h:0};
 function update(hours,seconds,camera,target,contribution,pigment,playbackRate=1,gain=.35){
  const f=Math.max(0,Math.min(nt-1,hours-.5)),a=Math.floor(f),b=Math.min(nt-1,a+1),w=f-a;
  const ta=texture(a,[a,b],contribution),tb=texture(b,[a,b],contribution);if(!ta||!tb)return;
  rm.uniforms.weather0.value=ta;rm.uniforms.weather1.value=tb;rm.uniforms.weight.value=w;rm.uniforms.clock.value=seconds;rm.uniforms.anchor.value.set(target.x,target.z);rm.uniforms.radius.value=Math.min(30,Math.max(1,camera.position.distanceTo(target)*.45));
  rm.uniforms.pigment.value.setRGB(pigment.r,pigment.g,pigment.b,THREE.SRGBColorSpace);emit.visible=contribution!==2;
  last={rain_mm_h:sample(a,target.x,target.z,0)*(1-w)+sample(b,target.x,target.z,0)*w,wet_mg_m2_h:sample(a,target.x,target.z,4)*(1-w)+sample(b,target.x,target.z,4)*w};

 }
 return{prepare,preload:prepareAll,update,metadata:wm,sources,objects:{rain,emit},get state(){return last;},get bridgeState(){return{mode:'actual_native_3D_volume',billboard:false};},set rainVisible(value){rain.visible=value;},set sourcesVisible(value){emit.visible=value;}};
}
