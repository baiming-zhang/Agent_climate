import * as THREE from 'three';

// Every sample is a transported 3D scalar. The three overlapping boxes and
// regional field are alternative resolutions, combined with weights summing1.
export const nearPartitionGLSL=`
 uniform vec2 nearCenters[3];uniform vec3 nearX0[3],nearY0[3];uniform vec2 nearX1[3],nearY1[3];
 vec2 localXY(vec3 p,int g){vec2 d=vec2(p.x,-p.z)-nearCenters[g];
  vec3 a=vec3(d.x,d.y,d.x*d.x);vec2 b=vec2(d.x*d.y,d.y*d.y);
  return vec2(dot(nearX0[g],a)+dot(nearX1[g],b),dot(nearY0[g],a)+dot(nearY1[g],b));}
 float rawNearWeight(vec3 p,float agl,int g){vec2 xy=localXY(p,g);
  return (1.-smoothstep(3000.,4000.,max(abs(xy.x),abs(xy.y))))*(1.-smoothstep(1500.,2000.,agl))*step(0.,agl);}
 float sumNearWeights(vec3 p,float agl){float s=0.;for(int g=0;g<3;g++)s+=rawNearWeight(p,agl,g);return s;}
`;

const fragment=`precision highp float;precision highp sampler3D;
 varying vec3 vWorld;out vec4 fragColor;
 uniform sampler3D fine0,fine1;uniform sampler2D terrain,depthMap;
 uniform vec3 lo,hi,boxLo,boxHi,eye,pigment;uniform vec2 horizontalShape,resolution;uniform mat4 inverseVP;
 uniform float timeWeight,gain,enabled,stackHeight;uniform int gridIndex;
 ${nearPartitionGLSL}
 float ground(vec3 p){vec2 q=vec2((p.x-lo.x)/(hi.x-lo.x),(hi.z-p.z)/(hi.z-lo.z));
  vec2 uv=(q*(horizontalShape-1.)+.5)/horizontalShape;return texture(terrain,uv).r;}
 vec3 local(vec3 p){return vec3(localXY(p,gridIndex),p.y/1.8*1000.-ground(p));}
 float asinh1(float x){return sign(x)*log(abs(x)+sqrt(x*x+1.));}
 vec3 param(vec3 p){float a=asinh1(8000.),qlo=asinh1(-stackHeight/.5),qhi=asinh1((2000.-stackHeight)/.5);
  return vec3((asinh1(p.x/.5)/a+1.)*.5,(asinh1(p.y/.5)/a+1.)*.5,(asinh1((p.z-stackHeight)/.5)-qlo)/(qhi-qlo));}
 float sinh1(float x){return (exp(x)-exp(-x))*.5;}
 vec3 edge(vec3 cell){float a=asinh1(8000.),qlo=asinh1(-stackHeight/.5),qhi=asinh1((2000.-stackHeight)/.5);
  return vec3(.5*sinh1((cell.x/96.*2.-1.)*a),.5*sinh1((cell.y/96.*2.-1.)*a),stackHeight+.5*sinh1(qlo+(qhi-qlo)*cell.z/96.));}
 void main(){if(enabled<.5)discard;
  vec3 d=normalize(vWorld-eye),inv=1./d,a=(boxLo-eye)*inv,b=(boxHi-eye)*inv,mn=min(a,b),mx=max(a,b);
  float entry=max(0.,max(max(mn.x,mn.y),mn.z)),end=min(min(mx.x,mx.y),mx.z);
  float depth=texture(depthMap,gl_FragCoord.xy/resolution).x;vec4 wp=inverseVP*vec4(gl_FragCoord.xy/resolution*2.-1.,depth*2.-1.,1.);
  if(depth<.999999)end=min(end,length(wp.xyz/wp.w-eye));if(end<=entry)discard;
  float t=entry,alpha=0.;
  for(int i=0;i<512;i++){
   if(t>=end||alpha>.995)break;
   // Probe just beyond a face to avoid repeatedly selecting the previous cell
   // at float32 world-coordinate precision. The integrated interval has no gap.
   float probe=min(.000002,(end-t)*.25);
   vec3 pos=eye+d*(t+probe),loc=local(pos),q=param(loc),velocity=(local(pos+d*.001)-loc)/.001;
   // Traverse nonuniform physical cell faces. Small nozzle cells cannot be
   // skipped by a regional fixed ray step. No billboard / added smoke path.
   vec3 cell=floor(q*96.);vec3 next=cell+step(vec3(0.),velocity),dist=(edge(next)-loc)/velocity;
   for(int k=0;k<3;k++)if(abs(velocity[k])<.00001||dist[k]<.00000005)dist[k]=1e10;
   float ds=min(end-t,max(.0000002,probe+min(min(dist.x,dist.y),dist.z)));
   vec3 samplePos=eye+d*(t+ds*.5),s=local(samplePos),uv=param(s);
   if(all(greaterThanEqual(uv,vec3(0.)))&&all(lessThanEqual(uv,vec3(1.)))){
    float c=mix(texture(fine0,uv).r,texture(fine1,uv).r,timeWeight);
    float w=rawNearWeight(samplePos,s.z,gridIndex)/max(1.,sumNearWeights(samplePos,s.z));
    float da=1.-exp(-c*w*gain*ds);alpha+=(1.-alpha)*da;
   }
   t+=ds;
  }
  if(alpha<.0001)discard;fragColor=vec4(pigment,alpha);
 }
`;

export function nearPartitionUniforms(meta){return Object.fromEntries([
 ['nearCenters',meta.groups.map(g=>new THREE.Vector2(...g.center_world_east_north_km))],
 ...['X','Y'].flatMap((name,i)=>[[`near${name}0`,meta.groups.map(g=>new THREE.Vector3(...g.inverse_projection_coefficients[i].slice(0,3)))],
  [`near${name}1`,meta.groups.map(g=>new THREE.Vector2(...g.inverse_projection_coefficients[i].slice(3)))]]),
 ].map(([k,value])=>[k,{value}]));}

export async function createNearVolume(overlay,regional,renderer,bytes,{base='./data/near/',engineering=false}={}){
 const meta=await(await fetch(base+'metadata.json')).json();
 if(!engineering&&(!meta.production_complete||meta.actual_hours!==360))throw Error('Full outlet-origin 360-hour fields required');
 const blocks=new Map(),textures=new Map(),luts=meta.groups.map(g=>Float32Array.from({length:256},(_,i)=>g.quantizer.scale_ppb*Math.expm1(i/255*g.quantizer.log_max)));
 const partitions=nearPartitionUniforms(meta);Object.assign(regional.uniforms,partitions);
 const materials=[],meshes=[];
 for(let g=0;g<3;g++){
  const b=meta.groups[g].world_bounds_east_north_km,rlo=regional.uniforms.lo.value,rhi=regional.uniforms.hi.value,shape=regional.uniforms.horizontalShape.value;
  const data=regional.uniforms.terrain.value.image.data;let groundMin=Infinity,groundMax=-Infinity;
  for(let y=0;y<shape.y;y++)for(let x=0;x<shape.x;x++){
   const e=rlo.x+(rhi.x-rlo.x)*x/Math.max(1,shape.x-1),n=-rhi.z+(rhi.z-rlo.z)*y/Math.max(1,shape.y-1),pad=(rhi.x-rlo.x)/Math.max(1,shape.x-1)*2;
   if(e<b[0]-pad||e>b[2]+pad||n<b[1]-pad||n>b[3]+pad)continue;
   groundMin=Math.min(groundMin,data[y*shape.x+x]);groundMax=Math.max(groundMax,data[y*shape.x+x]);
  }
  if(!Number.isFinite(groundMin)){groundMin=0;groundMax=0;}
  const lo=new THREE.Vector3(b[0],groundMin*.001*1.8,-b[3]),hi=new THREE.Vector3(b[2],(groundMax+2000)*.001*1.8,-b[1]);
  const uniforms={...regional.uniforms,...partitions,fine0:{value:null},fine1:{value:null},boxLo:{value:lo},boxHi:{value:hi},gridIndex:{value:g},stackHeight:{value:meta.groups[g].stack_height_AGL_m}};
  const m=new THREE.ShaderMaterial({vertexShader:regional.vertexShader,fragmentShader:fragment,uniforms,glslVersion:THREE.GLSL3,
   transparent:true,depthTest:false,depthWrite:false,side:THREE.BackSide});
  const span=hi.clone().sub(lo),mesh=new THREE.Mesh(new THREE.BoxGeometry(...span.toArray()),m);mesh.position.copy(lo).addScaledVector(span,.5);
  mesh.name=meta.groups[g].group+' actual native 3D residence concentration';mesh.renderOrder=1;overlay.add(mesh);materials.push(m);meshes.push(mesh);
 }
 async function block(index){const c=meta.chunks.find(c=>index>=c.first_index&&index<c.first_index+c.count);if(!c)throw Error('Near-field time missing');
  if(!blocks.has(c.file))blocks.set(c.file,bytes(base+c.file).then(b=>new Uint8Array(b)));return blocks.get(c.file);}
 async function prepare(index){await block(index);}
 async function preload(){let next=0;await Promise.all(Array.from({length:3},async()=>{while(next<meta.chunks.length)await block(meta.chunks[next++].first_index);}));}
 function frame(index){
  if(textures.has(index))return textures.get(index);
  const c=meta.chunks.find(c=>index>=c.first_index&&index<c.first_index+c.count),data=c?.loaded;if(!data)return null;
  const fields=meta.frames[index].fields,result=[];
  for(let g=0;g<3;g++){
   const f=fields[g],view=new DataView(data.buffer,data.byteOffset+f.offset,f.length),count=view.getUint32(0,true),a=new Float32Array(96**3);let p=4;
   if(count!==f.bricks)throw Error('Sparse 3D brick count mismatch');
   for(let k=0;k<count;k++){
    const x=view.getUint8(p)*8,y=view.getUint8(p+1)*8,z=view.getUint8(p+2)*8;p+=4;
    for(let iz=0;iz<8;iz++)for(let iy=0;iy<8;iy++)for(let ix=0;ix<8;ix++)a[((z+iz)*96+y+iy)*96+x+ix]=luts[g][view.getUint8(p++)];
   }
   if(p!==f.length)throw Error('Sparse 3D payload length mismatch');
   const t=new THREE.Data3DTexture(a,96,96,96);t.format=THREE.RedFormat;t.type=THREE.FloatType;t.minFilter=t.magFilter=THREE.LinearFilter;t.unpackAlignment=1;t.needsUpdate=true;renderer.initTexture(t);result.push(t);
  }
  textures.set(index,result);return result;
 }
 async function prepareAll(){await preload();for(const c of meta.chunks)c.loaded=await blocks.get(c.file);}
 async function prepareOne(index){await prepare(index);const c=meta.chunks.find(c=>index>=c.first_index&&index<c.first_index+c.count);c.loaded=await blocks.get(c.file);}
 function commit(a,b){const aa=frame(a),bb=frame(b);if(!aa||!bb)return false;
  for(let g=0;g<3;g++){materials[g].uniforms.fine0.value=aa[g];materials[g].uniforms.fine1.value=bb[g];}
  for(const [i,ts]of textures)if(textures.size>3&&i!==a&&i!==b){ts.forEach(t=>t.dispose());textures.delete(i);}
  return true;
 }
 function sample(point,agl){
  let total=0,value=0;
  const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  for(let g=0;g<3;g++){
   const group=meta.groups[g],d=[point.x-group.center_world_east_north_km[0],-point.z-group.center_world_east_north_km[1]],basis=[d[0],d[1],d[0]**2,d[0]*d[1],d[1]**2];
   const xy=group.inverse_projection_coefficients.map(row=>row.reduce((a,v,i)=>a+v*basis[i],0));
   const w=(1-smooth(3000,4000,Math.max(...xy.map(Math.abs))))*(1-smooth(1500,2000,agl))*(agl>=0?1:0);total+=w;
   if(!w)continue;
   const hs=group.stack_height_AGL_m,qlo=Math.asinh(-hs/.5),qhi=Math.asinh((2000-hs)/.5),q=[(Math.asinh(xy[0]/.5)/Math.asinh(8000)+1)*.5,(Math.asinh(xy[1]/.5)/Math.asinh(8000)+1)*.5,(Math.asinh((agl-hs)/.5)-qlo)/(qhi-qlo)];
   function scalar(t){if(!t)return 0;const f=q.map(v=>Math.max(0,Math.min(95,v*96-.5))),i=f.map(Math.floor),a=f.map((v,k)=>v-i[k]),data=t.image.data;let v=0;
    for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)v+=data[(Math.min(95,i[2]+z)*96+Math.min(95,i[1]+y))*96+Math.min(95,i[0]+x)]*(x?a[0]:1-a[0])*(y?a[1]:1-a[1])*(z?a[2]:1-a[2]);return v;}
   const u=materials[g].uniforms,tw=u.timeWeight.value;value+=w*(scalar(u.fine0.value)*(1-tw)+scalar(u.fine1.value)*tw);
  }
  return{ppb:value/Math.max(1,total),regional_weight:Math.max(0,1-total),near_weight:Math.min(1,total)};
 }
 return{metadata:meta,materials,meshes,prepare:prepareOne,preload:prepareAll,commit,frame,sample,
  get memory(){return{cached_frames:textures.size,sparse_bytes:meta.sparse_uncompressed_bytes};}};
}
