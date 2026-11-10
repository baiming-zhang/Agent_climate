import {nearPartitionGLSL} from './near_volume.mjs?v=mountain-single42-v4';
// Actual16AGL layers, two concentration scalars. Colours never carry data.
export const monthShader={
 vertex:`varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
 fragment:`precision highp float;precision highp sampler3D;
 varying vec3 vWorld;out vec4 fragColor;
 uniform sampler3D field0;uniform sampler3D field1;uniform sampler2D terrain;uniform sampler2D coverage;uniform sampler2D depthMap;
 uniform vec3 lo;uniform vec3 hi;uniform vec2 horizontalShape;uniform vec3 eye;uniform vec2 resolution;uniform mat4 inverseVP;
 uniform float heights[16];uniform float topAGL;uniform float timeWeight;uniform float gain;uniform float enabled;uniform float contribution;uniform float raySteps;uniform vec3 pigment;
 ${nearPartitionGLSL}
 float sampleScalar(vec3 p){
  vec2 q=vec2((p.x-lo.x)/(hi.x-lo.x),(hi.z-p.z)/(hi.z-lo.z));
  if(any(lessThan(q,vec2(0.)))||any(greaterThan(q,vec2(1.))))return 0.;
  vec2 uv=(q*(horizontalShape-1.)+.5)/horizontalShape;
  if(texture(coverage,uv).r<.5)return 0.;
  float agl=p.y/1.8*1000.-texture(terrain,uv).r;
  if(agl<0.||agl>topAGL)return 0.;
  float regionalWeight=max(0.,1.-sumNearWeights(p,agl));
  if(regionalWeight==0.)return 0.;
  float layer=0.;
  for(int k=0;k<15;k++){if(agl>=heights[k+1])layer=float(k+1);else if(agl>=heights[k]){layer=float(k)+(agl-heights[k])/(heights[k+1]-heights[k]);break;}}
  vec3 nativeUV=vec3(uv,(layer+.5)/16.);
  vec2 pair=mix(texture(field0,nativeUV).rg,texture(field1,nativeUV).rg,timeWeight);
  float c=contribution<.5?pair.r+pair.g:(contribution<1.5?pair.r:pair.g);
  return c*regionalWeight;
 }
 void main(){
  if(enabled<.5)discard;
  vec3 direction=normalize(vWorld-eye),inv=1./direction;
  vec3 a=(lo-eye)*inv,b=(hi-eye)*inv,mn=min(a,b),mx=max(a,b);
  float entry=max(0.,max(max(mn.x,mn.y),mn.z)),exit=min(min(mx.x,mx.y),mx.z);
  vec2 pixel=gl_FragCoord.xy/resolution;float depth=texture(depthMap,pixel).x;
  vec4 wp=inverseVP*vec4(pixel*2.-1.,depth*2.-1.,1.);
  if(depth<.999999)exit=min(exit,length(wp.xyz/wp.w-eye));
  if(exit<=entry)discard;
  float ds=(exit-entry)/raySteps,alpha=0.;
  for(int i=0;i<256;i++){
   if(float(i)>=raySteps)break;
   float c=sampleScalar(eye+direction*(entry+(float(i)+.5)*ds));
   float da=1.-exp(-c*gain*ds);
   alpha+=(1.-alpha)*da;if(alpha>.99)break;
  }
  if(alpha<.0001)discard;fragColor=vec4(pigment,alpha);
 }`
};
