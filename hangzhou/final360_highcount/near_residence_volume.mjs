import * as THREE from 'three';
import {temporalScalar,temporalScalarGLSL} from './temporal_scalar.mjs';
import {scalarFrameCache,regularTime} from './scalar_frame_cache.mjs';

// Alternative diagnostic views, not additive physical source masses.
export const nearPartitionGLSL=`
 uniform vec2 nearCenters[4],nearCoefficients[4];
 vec2 localXY(vec3 p,int g){return (vec2(p.x,-p.z)-nearCenters[g])*nearCoefficients[g];}
 float rawNearWeight(vec3 p,float agl,int g){return (1.-smoothstep(350.,500.,length(localXY(p,g))))*(1.-smoothstep(1500.,2000.,agl))*step(0.,agl);}
 float sumNearWeights(vec3 p,float agl){float w=0.;for(int g=0;g<4;g++)w+=rawNearWeight(p,agl,g);return w;}
`;
const fragment=`precision highp float;precision highp sampler3D;
 varying vec3 vWorld;out vec4 fragColor;
 uniform sampler3D finePrevious,fine0,fine1,fineFollowing;uniform sampler2D terrain,depthMap;
 uniform vec3 lo,hi,boxLo,boxHi,eye,pigment;uniform vec2 terrainShape,resolution;uniform mat4 inverseVP;
 uniform float nearTimeWeight,gain,enabled,stackHeight,horizontalScale,verticalScale;uniform int gridIndex;
 ${nearPartitionGLSL}
 ${temporalScalarGLSL}
 float ground(vec3 p){vec2 q=vec2((p.x-lo.x)/(hi.x-lo.x),(hi.z-p.z)/(hi.z-lo.z));return texture(terrain,(q*(terrainShape-1.)+.5)/terrainShape).r;}
 vec3 local(vec3 p){return vec3(localXY(p,gridIndex),p.y*1000./1.8-ground(p));}
 float asinh1(float x){return sign(x)*log(abs(x)+sqrt(x*x+1.));}
 float sinh1(float x){return (exp(x)-exp(-x))*.5;}
 vec3 param(vec3 p){float a=asinh1(500./horizontalScale),qlo=asinh1(-stackHeight/verticalScale),qhi=asinh1((2000.-stackHeight)/verticalScale);return vec3((asinh1(p.x/horizontalScale)/a+1.)*.5,(asinh1(p.y/horizontalScale)/a+1.)*.5,(asinh1((p.z-stackHeight)/verticalScale)-qlo)/(qhi-qlo));}
 vec3 edge(vec3 cell){float a=asinh1(500./horizontalScale),qlo=asinh1(-stackHeight/verticalScale),qhi=asinh1((2000.-stackHeight)/verticalScale);return vec3(horizontalScale*sinh1((cell.x/96.*2.-1.)*a),horizontalScale*sinh1((cell.y/96.*2.-1.)*a),stackHeight+verticalScale*sinh1(qlo+(qhi-qlo)*cell.z/96.));}
 void main(){if(enabled<.5)discard;vec3 d=normalize(vWorld-eye),inv=1./d,a=(boxLo-eye)*inv,b=(boxHi-eye)*inv,mn=min(a,b),mx=max(a,b);float entry=max(0.,max(max(mn.x,mn.y),mn.z)),end=min(min(mx.x,mx.y),mx.z);
 float depth=texture(depthMap,gl_FragCoord.xy/resolution).x;vec4 wp=inverseVP*vec4(gl_FragCoord.xy/resolution*2.-1.,depth*2.-1.,1.);if(depth<.999999)end=min(end,length(wp.xyz/wp.w-eye));if(end<=entry)discard;
 float t=entry,alpha=0.;for(int i=0;i<512;i++){if(t>=end||alpha>.995)break;
 float probe=min(.000002,(end-t)*.25);vec3 pos=eye+d*(t+probe),loc=local(pos),q=param(loc),velocity=(local(pos+d*.001)-loc)/.001;
 vec3 cell=floor(q*96.),next=cell+step(vec3(0.),velocity),dist=(edge(next)-loc)/velocity;
 for(int k=0;k<3;k++)if(abs(velocity[k])<.00001||dist[k]<.00000005)dist[k]=1e10;
 float ds=min(end-t,max(.0000002,probe+min(min(dist.x,dist.y),dist.z)));vec3 samplePos=eye+d*(t+ds*.5),s=local(samplePos),uv=param(s);
 if(all(greaterThanEqual(uv,vec3(0.)))&&all(lessThanEqual(uv,vec3(1.)))){float c=temporalScalar(texture(finePrevious,uv).r,texture(fine0,uv).r,texture(fine1,uv).r,texture(fineFollowing,uv).r,nearTimeWeight);float w=rawNearWeight(samplePos,s.z,gridIndex)/max(1.,sumNearWeights(samplePos,s.z));float da=1.-exp(-c*w*gain*ds);alpha+=(1.-alpha)*da;}t+=ds;}
 if(alpha<.0001)discard;fragColor=vec4(pigment,alpha);}
`;
function smooth(a,b,x){const q=Math.max(0,Math.min(1,(x-a)/(b-a)));return q*q*(3-2*q);}
export async function createNearVolume(overlay,regional,renderer,{base='./near/'}={}){
 const r=await fetch(base+'metadata.json');if(!r.ok)throw Error('Actual residence metadata unavailable');const meta=await r.json();
 if(!meta.complete_360h_asset_pack||meta.groups.length!==4)throw Error('Complete four-outlet actual residence required');
 const store=scalarFrameCache(meta.frames,{base}),textures=new Map(),materials=[],meshes=[],luts=meta.groups.map(g=>Float32Array.from({length:256},(_,i)=>g.quantizer.scale_ug_m3*Math.expm1(i/255*g.quantizer.log_max)));
 const partitions={nearCenters:{value:meta.groups.map(g=>new THREE.Vector2(...g.centre_world_east_north_km))},nearCoefficients:{value:meta.groups.map(g=>new THREE.Vector2(g.inverse_projection_coefficients[0][0],g.inverse_projection_coefficients[1][1]))}};Object.assign(regional.uniforms,partitions);
 const zero=new THREE.Data3DTexture(new Float32Array(96**3),96,96,96);zero.format=THREE.RedFormat;zero.type=THREE.FloatType;zero.minFilter=zero.magFilter=THREE.LinearFilter;zero.unpackAlignment=1;zero.needsUpdate=true;renderer.initTexture(zero);
 for(let g=0;g<4;g++){const group=meta.groups[g],b=group.world_bounds_east_north_km,globalLo=regional.uniforms.lo.value,globalHi=regional.uniforms.hi.value;
  const shape=regional.uniforms.terrainShape.value,data=regional.uniforms.terrain.value.image.data;let groundMin=Infinity,groundMax=-Infinity;
  const dx=(globalHi.x-globalLo.x)/(shape.x-1),dy=(globalHi.z-globalLo.z)/(shape.y-1);
  for(let y=0;y<shape.y;y++)for(let x=0;x<shape.x;x++){const e=globalLo.x+x*dx,n=-globalHi.z+y*dy;if(e<b[0]-dx||e>b[2]+dx||n<b[1]-dy||n>b[3]+dy)continue;const h=data[y*shape.x+x];groundMin=Math.min(groundMin,h);groundMax=Math.max(groundMax,h);}if(!Number.isFinite(groundMin))throw Error('Actual near terrain coverage missing');
  const lo=new THREE.Vector3(b[0],groundMin*.001*1.8,-b[3]),hi=new THREE.Vector3(b[2],(groundMax+group.top_AGL_m)*.001*1.8,-b[1]),span=hi.clone().sub(lo);
  // Share camera, colour, depth and gain objects; keep residence clock separate.
  const u={...regional.uniforms,...partitions,finePrevious:{value:zero},fine0:{value:zero},fine1:{value:zero},fineFollowing:{value:zero},boxLo:{value:lo},boxHi:{value:hi},gridIndex:{value:g},stackHeight:{value:group.stack_height_AGL_m},horizontalScale:{value:group.horizontal_asinh_scale_m},verticalScale:{value:group.vertical_asinh_scale_m},nearTimeWeight:{value:0}};
  const m=new THREE.ShaderMaterial({vertexShader:regional.vertexShader,fragmentShader:fragment,uniforms:u,glslVersion:THREE.GLSL3,transparent:true,depthTest:false,depthWrite:false,side:THREE.BackSide});const mesh=new THREE.Mesh(new THREE.BoxGeometry(...span.toArray()),m);mesh.position.copy(lo).addScaledVector(span,.5);mesh.name=group.id+' accepted-path residence diagnostic';mesh.renderOrder=1;overlay.add(mesh);materials.push(m);meshes.push(mesh);
 }
 function time(h){if(h<.5)return{p:-1,a:-1,b:0,n:1,weight:Math.max(0,h/.5)};return regularTime(h,.5,1,360);}
 async function prepare(h){const t=time(h),keys=[...new Set([t.p,t.a,t.b,t.n].filter(i=>i>=0))];await store.prepare(keys);
  for(const index of keys){if(textures.has(index))continue;const b=await store.frame(index),fields=meta.frames[index].fields,result=[];
   for(let g=0;g<4;g++){const f=fields[g],v=new DataView(b.buffer,b.byteOffset+f.offset,f.length),count=v.getUint32(0,true),a=new Float32Array(96**3);let p=4;if(count!==f.bricks)throw Error('Actual sparse brick count mismatch');
    for(let k=0;k<count;k++){const x=v.getUint8(p)*8,y=v.getUint8(p+1)*8,z=v.getUint8(p+2)*8;p+=4;for(let iz=0;iz<8;iz++)for(let iy=0;iy<8;iy++)for(let ix=0;ix<8;ix++)a[((z+iz)*96+y+iy)*96+x+ix]=luts[g][v.getUint8(p++)];}if(p!==f.length)throw Error('Actual sparse payload length mismatch');
    const tex=new THREE.Data3DTexture(a,96,96,96);tex.format=THREE.RedFormat;tex.type=THREE.FloatType;tex.minFilter=tex.magFilter=THREE.LinearFilter;tex.unpackAlignment=1;tex.needsUpdate=true;renderer.initTexture(tex);result.push(tex);
   }textures.set(index,result);
  }for(const[index,fields]of textures)if(!keys.includes(index)){fields.forEach(t=>t.dispose());textures.delete(index);}return t;
 }
 function commit(h){const t=time(h),frames=[t.p,t.a,t.b,t.n].map(i=>i<0?Array(4).fill(zero):textures.get(i));if(frames.some(x=>!x))return false;for(let g=0;g<4;g++){const u=materials[g].uniforms;['finePrevious','fine0','fine1','fineFollowing'].forEach((key,j)=>u[key].value=frames[j][g]);u.nearTimeWeight.value=t.weight;}return true;}
 function sample(point,agl){let total=0,value=0;for(let g=0;g<4;g++){const group=meta.groups[g],d=[point.x-group.centre_world_east_north_km[0],-point.z-group.centre_world_east_north_km[1]],xy=[d[0]*group.inverse_projection_coefficients[0][0],d[1]*group.inverse_projection_coefficients[1][1]],w=(1-smooth(350,500,Math.hypot(...xy)))*(1-smooth(1500,2000,agl))*(agl>=0?1:0);total+=w;if(!w)continue;
  const ax=group.horizontal_asinh_scale_m,az=group.vertical_asinh_scale_m,hs=group.stack_height_AGL_m,qlo=Math.asinh(-hs/az),qhi=Math.asinh((2000-hs)/az),q=[(Math.asinh(xy[0]/ax)/Math.asinh(500/ax)+1)*.5,(Math.asinh(xy[1]/ax)/Math.asinh(500/ax)+1)*.5,(Math.asinh((agl-hs)/az)-qlo)/(qhi-qlo)];if(q.some(v=>v<0||v>1))continue;
  function scalar(tex){const f=q.map(v=>Math.max(0,Math.min(95,v*96-.5))),i=f.map(Math.floor),a=f.map((v,k)=>v-i[k]),data=tex.image.data;let v=0;for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)v+=data[(Math.min(95,i[2]+z)*96+Math.min(95,i[1]+y))*96+Math.min(95,i[0]+x)]*(x?a[0]:1-a[0])*(y?a[1]:1-a[1])*(z?a[2]:1-a[2]);return v;}
  const u=materials[g].uniforms;value+=w*temporalScalar(scalar(u.finePrevious.value),scalar(u.fine0.value),scalar(u.fine1.value),scalar(u.fineFollowing.value),u.nearTimeWeight.value);
 }return{value:value/Math.max(1,total),near_weight:Math.min(1,total),regional_weight:Math.max(0,1-total),unit:'µg/m³',type:'Quantized selected-path hourly residence display estimate; not full-count native concentration'};}
 return{metadata:meta,materials,meshes,prepare,commit,preload:store.preload,sample,get memory(){return{...store.memory,texture_frames:textures.size};}};
}
