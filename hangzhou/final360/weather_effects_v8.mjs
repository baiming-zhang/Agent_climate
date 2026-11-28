import * as THREE from 'three';
import {temporalScalarGLSL} from './temporal_scalar.mjs';

// One frame, two independent scalar optical-depth accumulators. No RGB frames
// or adjacent rendered pictures are blended to create temporal continuity.
export const weatherAndSO2Composite={
 vertex:'varying vec2 vUV;void main(){vUV=uv;gl_Position=vec4(position.xy,0.,1.);}',
 fragment:`precision highp float;varying vec2 vUV;uniform sampler2D opaqueImage,opticalDepth;uniform vec3 pigment,cloudPigment;
 void main(){vec4 background=texture2D(opaqueImage,vUV);vec2 tau=max(texture2D(opticalDepth,vUV).rg,vec2(0.));float sum=tau.x+tau.y;
 vec3 color=sum>0.?(pigment*tau.x+cloudPigment*tau.y)/sum:pigment;gl_FragColor=vec4(mix(background.rgb,color,1.-exp(-sum)),background.a);
 #include <colorspace_fragment>
 }`
};

// Cloud fraction and rainfall are independent diagnostic fields from the
// frozen weather. Their graphic appearance never alters the SO2 calculation.
export function createActualWeatherEffectsV8({opaqueScene,opticalScene,weather,world,groundTexture,groundBounds,volumeBox,verticalScale=1.8,sharedUniforms,displayGroundAtWorld=null}){
 const m=weather.meta,[nz,ny,nx]=m.shape_zyx;if(nz!==15)throw Error('Wrong actual weather layer count');
 const wl=world(m.longitudes[0],m.latitudes[0]),wh=world(m.longitudes.at(-1),m.latitudes.at(-1));
 const common={weatherLo:{value:new THREE.Vector2(...wl)},weatherHi:{value:new THREE.Vector2(...wh)},
  groundLo:{value:new THREE.Vector2(...groundBounds[0])},groundHi:{value:new THREE.Vector2(...groundBounds[1])},ground:{value:groundTexture}};
 const cloudUniforms={...sharedUniforms,...common,previousCloud:{value:null},cloud0:{value:null},cloud1:{value:null},followingCloud:{value:null},
  heights:{value:m.height_centers_AGL_m},topAGL:{value:m.height_interface_AGL_m.at(-1)},timeWeight:{value:0},cloudGain:{value:.08},cloudEnabled:{value:1},
  boxLo:{value:volumeBox.min},boxHi:{value:volumeBox.max},cloudRaySteps:{value:96}};
 const material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,uniforms:cloudUniforms,side:THREE.BackSide,depthTest:false,depthWrite:false,transparent:true,
  blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,
  vertexShader:'varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}',
  fragmentShader:`precision highp float;precision highp sampler3D;varying vec3 vWorld;out vec4 pixel;
  uniform sampler3D previousCloud,cloud0,cloud1,followingCloud;uniform sampler2D ground,depthMap;
  uniform vec2 weatherLo,weatherHi,groundLo,groundHi,resolution;uniform vec3 eye,boxLo,boxHi;uniform mat4 inverseVP;
  uniform float heights[15],topAGL,timeWeight,cloudGain,cloudEnabled,cloudRaySteps;
  ${temporalScalarGLSL}
  float fractionAt(vec3 p){
   vec2 en=vec2(p.x,-p.z),q=(en-weatherLo)/(weatherHi-weatherLo),guv=(en-groundLo)/(groundHi-groundLo);
   if(any(lessThan(q,vec2(0.)))||any(greaterThan(q,vec2(1.)))||any(lessThan(guv,vec2(0.)))||any(greaterThan(guv,vec2(1.))))return 0.;
   float agl=p.y*1000./${verticalScale.toFixed(8)}-texture(ground,guv).r;if(agl<0.||agl>=topAGL)return 0.;
   float layer=0.;for(int k=0;k<14;k++){if(agl>=heights[k+1])layer=float(k+1);else if(agl>=heights[k]){layer=float(k)+(agl-heights[k])/(heights[k+1]-heights[k]);break;}}
   vec3 uv=vec3((q*vec2(${(nx-1).toFixed(1)},${(ny-1).toFixed(1)})+.5)/vec2(${nx.toFixed(1)},${ny.toFixed(1)}),(layer+.5)/15.);
   return temporalScalar(texture(previousCloud,uv).r,texture(cloud0,uv).r,texture(cloud1,uv).r,texture(followingCloud,uv).r,timeWeight);
  }
  void main(){
   if(cloudEnabled<.5)discard;vec3 direction=normalize(vWorld-eye),a=(boxLo-eye)/direction,b=(boxHi-eye)/direction,mn=min(a,b),mx=max(a,b);
   float entry=max(0.,max(max(mn.x,mn.y),mn.z)),exit=min(min(mx.x,mx.y),mx.z);
   float depth=texture(depthMap,gl_FragCoord.xy/resolution).r;vec4 surface=inverseVP*vec4(gl_FragCoord.xy/resolution*2.-1.,depth*2.-1.,1.);
   if(depth<.999999)exit=min(exit,length(surface.xyz/surface.w-eye));if(exit<=entry)discard;
   float ds=(exit-entry)/cloudRaySteps,tau=0.;for(int i=0;i<192;i++){if(float(i)>=cloudRaySteps)break;tau+=fractionAt(eye+direction*(entry+(float(i)+.5)*ds))*ds*cloudGain;}
   if(tau<=0.)discard;pixel=vec4(0.,tau,0.,0.);
  }`});
 const cloud=new THREE.Mesh(new THREE.BoxGeometry(...volumeBox.getSize(new THREE.Vector3()).toArray()),material);cloud.position.copy(volumeBox.getCenter(new THREE.Vector3()));cloud.frustumCulled=false;cloud.name='Actual frozen CLDFRA · diagnostic volume';opticalScene.add(cloud);
 const count=1600,seeds=new Float32Array(count*2*3),ends=new Float32Array(count*2),geometry=new THREE.BufferGeometry();
 for(let i=0;i<count;i++)for(let j=0;j<2;j++){const k=i*2+j;seeds.set([(i*.61803398875)%1,(i*.41421356237)%1,(i*.73205080757)%1],k*3);ends[k]=j;}
 const actualGround=new Float32Array(count*2),groundValid=new Float32Array(count*2).fill(1);
 geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*6),3));geometry.setAttribute('seed',new THREE.BufferAttribute(seeds,3));geometry.setAttribute('end',new THREE.BufferAttribute(ends,1));geometry.setAttribute('actualGround',new THREE.BufferAttribute(actualGround,1));geometry.setAttribute('groundValid',new THREE.BufferAttribute(groundValid,1));
 const rainMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{...common,rain0:{value:null},rain1:{value:null},rainWeight:{value:0},clock:{value:0},anchor:{value:new THREE.Vector2()},radius:{value:2},rainEnabled:{value:1},useDisplayGround:{value:displayGroundAtWorld?1:0}},
  vertexShader:`attribute vec3 seed;attribute float end,actualGround,groundValid;uniform sampler2D rain0,rain1,ground;uniform vec2 weatherLo,weatherHi,groundLo,groundHi,anchor;uniform float radius,rainWeight,clock,rainEnabled,useDisplayGround;varying float opacity;
   void main(){vec2 en=anchor+(seed.xy-.5)*radius*2.,q=(en-weatherLo)/(weatherHi-weatherLo),uv=(q*vec2(${(nx-1).toFixed(1)},${(ny-1).toFixed(1)})+.5)/vec2(${nx.toFixed(1)},${ny.toFixed(1)});
    float rate=mix(texture2D(rain0,uv).r,texture2D(rain1,uv).r,rainWeight),h=mix(texture2D(ground,(en-groundLo)/(groundHi-groundLo)).r,actualGround,useDisplayGround)*.001*${verticalScale.toFixed(8)};
    float y=h+.015+fract(seed.z-clock*.7)*.35+end*.016;opacity=(1.-exp(-max(0.,rate)*.2))*.55*rainEnabled*groundValid;
    opacity*=step(0.,q.x)*step(q.x,1.)*step(0.,q.y)*step(q.y,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(en.x,y,-en.y,1.);
   }`,fragmentShader:'varying float opacity;void main(){if(opacity<.001)discard;gl_FragColor=vec4(.20,.35,.46,opacity);\n#include <colorspace_fragment>\n}'});
 const rain=new THREE.LineSegments(geometry,rainMaterial);rain.frustumCulled=false;rain.name='Actual positive liquid-precipitation glyphs · not a droplet solver';opaqueScene.add(rain);
 let preparedTime=null,lastKey='';
 async function prepare(hours){preparedTime=await weather.ensure(hours);return preparedTime;}
 function commit(hours){
  const t=weather.timing(hours),key=[t.weather.p,t.weather.a,t.weather.b,t.weather.n].join(':');
  if(key!==lastKey){cloudUniforms.previousCloud.value=weather.cloudTexture(t.weather.p);cloudUniforms.cloud0.value=weather.cloudTexture(t.weather.a);cloudUniforms.cloud1.value=weather.cloudTexture(t.weather.b);cloudUniforms.followingCloud.value=weather.cloudTexture(t.weather.n);lastKey=key;}
  cloudUniforms.timeWeight.value=t.weather.weight;
  if(m.liquid_display_binding_qualified){rainMaterial.uniforms.rain0.value=weather.rainTexture(t.precipitation.a);rainMaterial.uniforms.rain1.value=weather.rainTexture(t.precipitation.b);rainMaterial.uniforms.rainWeight.value=t.precipitation.weight;}else rainMaterial.uniforms.rainEnabled.value=0;
 }
 let lastAnchor='';
 function update(seconds,camera,target){
  const radius=Math.min(25,Math.max(.4,camera.position.distanceTo(target)*.4));rainMaterial.uniforms.clock.value=seconds;rainMaterial.uniforms.anchor.value.set(target.x,-target.z);rainMaterial.uniforms.radius.value=radius;
  const key=[target.x,target.z,radius].join(':');
  if(displayGroundAtWorld&&key!==lastAnchor){for(let i=0;i<count;i++){const k=i*6,x=target.x+(seeds[k]-.5)*radius*2,n=-target.z+(seeds[k+1]-.5)*radius*2,h=displayGroundAtWorld(x,n);for(let j=0;j<2;j++){actualGround[i*2+j]=h===null?0:h;groundValid[i*2+j]=h===null?0:1;}}geometry.attributes.actualGround.needsUpdate=true;geometry.attributes.groundValid.needsUpdate=true;lastAnchor=key;}
 }
 return{prepare,commit,update,metadata:m,objects:{cloud,rain},set cloudsVisible(value){cloudUniforms.cloudEnabled.value=value?1:0;},set rainVisible(value){rain.visible=!!value&&m.liquid_display_binding_qualified;},
  role:'Independent weather display diagnostics; rainfall glyphs do not solve drops, add turbulence, or edit SO2 mass/opacity.',get prepared(){return preparedTime!==null;}};
}
