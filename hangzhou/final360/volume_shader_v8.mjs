import {temporalScalarGLSL} from './temporal_scalar.mjs';

// Same scalar ray integration as the Vancouver renderer, with this product's
// actual layer count and four concentration components. No old52-layer state.
export function makeFinal360VolumeShader({verticalScale=1.8,aglScale=1.8,outputOpticalDepth=false}={}){
  if(!(verticalScale>0&&aglScale>0))throw Error('Invalid display geometry scales');
  return {
    vertex:'varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}',
    fragment:`precision highp float;precision highp sampler3D;
    varying vec3 vWorld;out vec4 fragColor;
    uniform sampler3D previousField,field0,field1,followingField;
    uniform sampler2D displayTerrain,depthMap;
    uniform vec3 eye,lo,hi,pigment;
    uniform vec2 fieldLo,fieldHi,terrainLo,terrainHi,resolution;
    uniform mat4 inverseVP;
    uniform float heights[15];
    uniform float topAGL,timeWeight,gain,enabled,contribution,raySteps,replaceCoarseNear;
    ${temporalScalarGLSL}
    float selectContribution(vec4 values){
      if(replaceCoarseNear>.5)values.b=0.;
      if(contribution<.5)return values.r+values.g+values.b+values.a;
      if(contribution<1.5)return values.r+values.b+values.a;
      if(contribution<2.5)return values.g;
      if(contribution<3.5)return values.r;
      if(contribution<4.5)return values.b;
      return values.a;
    }
    float sampleScalar(vec3 p){
      vec2 eastNorth=vec2(p.x,-p.z),q=(eastNorth-fieldLo)/(fieldHi-fieldLo);
      if(any(lessThan(q,vec2(0.)))||any(greaterThanEqual(q,vec2(1.))))return 0.;
      vec2 groundUV=(eastNorth-terrainLo)/(terrainHi-terrainLo);
      if(any(lessThan(groundUV,vec2(0.)))||any(greaterThan(groundUV,vec2(1.))))return 0.;
      float agl=(p.y*1000.-texture(displayTerrain,groundUV).r*${verticalScale.toFixed(8)})/${aglScale.toFixed(8)};
      if(agl<0.||agl>=topAGL)return 0.;
      float layer=0.;
      for(int k=0;k<14;k++){
        if(agl>=heights[k+1])layer=float(k+1);
        else if(agl>=heights[k]){layer=float(k)+(agl-heights[k])/(heights[k+1]-heights[k]);break;}
      }
      vec3 uvw=vec3(q,(layer+.5)/15.);
      vec4 p0=texture(previousField,uvw),a=texture(field0,uvw),b=texture(field1,uvw),n=texture(followingField,uvw);
      vec4 c=vec4(temporalScalar(p0.r,a.r,b.r,n.r,timeWeight),temporalScalar(p0.g,a.g,b.g,n.g,timeWeight),
                  temporalScalar(p0.b,a.b,b.b,n.b,timeWeight),temporalScalar(p0.a,a.a,b.a,n.a,timeWeight));
      return selectContribution(c);
    }
    void main(){
      if(enabled<.5)discard;
      vec3 direction=normalize(vWorld-eye),inverseDirection=1./direction;
      vec3 a=(lo-eye)*inverseDirection,b=(hi-eye)*inverseDirection,mn=min(a,b),mx=max(a,b);
      float entry=max(0.,max(max(mn.x,mn.y),mn.z)),exit=min(min(mx.x,mx.y),mx.z);
      vec2 pixel=gl_FragCoord.xy/resolution;float depth=texture(depthMap,pixel).r;
      vec4 wp=inverseVP*vec4(pixel*2.-1.,depth*2.-1.,1.);
      if(depth<.999999)exit=min(exit,length(wp.xyz/wp.w-eye));
      if(exit<=entry)discard;
      float ds=(exit-entry)/raySteps,tau=0.;
      for(int i=0;i<384;i++){
        if(float(i)>=raySteps)break;
        float c=sampleScalar(eye+direction*(entry+(float(i)+.5)*ds));
        tau+=c*gain*ds;
      }
      if(tau<=0.)discard;
      fragColor=${outputOpticalDepth?'vec4(tau,0.,0.,0.)':'vec4(pigment,1.-exp(-tau))'};
    }`
  };
}
