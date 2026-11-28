// Actual finite3D cylinders carry concentration, not sprites or painted smoke.
// They accumulate only the scalar optical depth into a same-frame float target.
// Map that one scalar target to pigment once, after all source contributions.
export function makePlumeGeometryShader({sourceCount,verticalScale=1.8}={}){
  if(!Number.isInteger(sourceCount)||sourceCount<1||!(verticalScale>0))throw Error('Invalid physical source geometry');
  return {
    vertex:`precision highp float;
      attribute float sourceIndex;
      attribute vec3 cylinderStart,cylinderEnd;
      attribute float cylinderRadius,meanConcentration;
      uniform vec3 sourceOrigins[${sourceCount}];
      uniform vec4 sourceProjections[${sourceCount}];
      out vec3 worldPoint;
      flat out vec3 startPhysical,endPhysical;
      flat out float radiusPhysical,concentration;
      flat out vec3 projectedOrigin;
      flat out vec4 localProjection;
      void main(){
        int source=int(sourceIndex+.5);
        vec3 origin=sourceOrigins[source];localProjection=sourceProjections[source];projectedOrigin=origin;
        startPhysical=cylinderStart;endPhysical=cylinderEnd;
        radiusPhysical=cylinderRadius;concentration=meanConcentration;
        vec3 delta=endPhysical-startPhysical,axis=normalize(delta);
        vec3 tangent=normalize(cross(axis,abs(axis.z)<.9?vec3(0.,0.,1.):vec3(0.,1.,0.)));
        vec3 bitangent=cross(axis,tangent);
        vec3 physical=(startPhysical+endPhysical)*.5+tangent*position.x*cylinderRadius+
          bitangent*position.y*cylinderRadius+delta*position.z*.5;
        vec2 projected=origin.xy+mat2(localProjection.xy,localProjection.zw)*physical.xy;
        worldPoint=vec3(projected.x*.001,(origin.z+physical.z)*${verticalScale.toFixed(8)}*.001,-projected.y*.001);
        gl_Position=projectionMatrix*viewMatrix*vec4(worldPoint,1.);
      }`,
    fragment:`precision highp float;
      in vec3 worldPoint;
      flat in vec3 startPhysical,endPhysical;
      flat in float radiusPhysical,concentration;
      flat in vec3 projectedOrigin;
      flat in vec4 localProjection;
      uniform vec3 eye;
      uniform vec2 resolution;
      uniform sampler2D depthMap;
      uniform mat4 inverseVP;
      uniform float gain,densityWeight,enabled;
      out vec4 fragColor;
      void main(){
        if(enabled<.5||densityWeight<=0.||concentration<=0.)discard;
        vec3 direction=normalize(worldPoint-eye);
        mat2 inverseProjection=inverse(mat2(localProjection.xy,localProjection.zw));
        vec3 rayOrigin=vec3(inverseProjection*(vec2(eye.x,-eye.z)*1000.-projectedOrigin.xy),eye.y*1000./${verticalScale.toFixed(8)}-projectedOrigin.z);
        vec3 rayDirection=vec3(inverseProjection*vec2(direction.x,-direction.z)*1000.,direction.y*1000./${verticalScale.toFixed(8)});
        vec3 axisVector=endPhysical-startPhysical;float lengthPhysical=length(axisVector);
        if(lengthPhysical<=0.||radiusPhysical<=0.)discard;
        vec3 axis=axisVector/lengthPhysical,offset=rayOrigin-startPhysical;
        float alongDirection=dot(rayDirection,axis),alongOrigin=dot(offset,axis);
        vec3 radialDirection=rayDirection-alongDirection*axis,radialOrigin=offset-alongOrigin*axis;
        float A=dot(radialDirection,radialDirection),C=dot(radialOrigin,radialOrigin)-radiusPhysical*radiusPhysical;
        float entry=0.,exit=1.e20;
        if(A<1.e-10){if(C>0.)discard;}
        else{
          float closestTime=-dot(radialOrigin,radialDirection)/A;
          vec3 closestPoint=radialOrigin+radialDirection*closestTime;
          float remaining=radiusPhysical*radiusPhysical-dot(closestPoint,closestPoint);
          if(remaining<0.)discard;
          float halfTime=sqrt(max(0.,remaining)/A);
          float a=closestTime-halfTime,b=closestTime+halfTime;
          entry=max(entry,min(a,b));exit=min(exit,max(a,b));
        }
        if(abs(alongDirection)<1.e-10){if(alongOrigin<0.||alongOrigin>lengthPhysical)discard;}
        else{
          float a=-alongOrigin/alongDirection,b=(lengthPhysical-alongOrigin)/alongDirection;
          entry=max(entry,min(a,b));exit=min(exit,max(a,b));
        }
        vec2 pixel=gl_FragCoord.xy/resolution;float depth=texture(depthMap,pixel).r;
        if(depth<.999999){
          vec4 surface=inverseVP*vec4(pixel*2.-1.,depth*2.-1.,1.);
          exit=min(exit,length(surface.xyz/surface.w-eye));
        }
        if(exit<=entry)discard;
        float tau=concentration*densityWeight*gain*(exit-entry);
        fragColor=vec4(tau,0.,0.,0.);
      }`
  };
}

export const opticalDepthComposite={
  vertex:'varying vec2 vUV;void main(){vUV=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragment:`precision highp float;
    varying vec2 vUV;
    uniform sampler2D opaqueImage,opticalDepth;
    uniform vec3 pigment;
    void main(){
      vec4 background=texture2D(opaqueImage,vUV);
      float tau=texture2D(opticalDepth,vUV).r;
      gl_FragColor=vec4(mix(background.rgb,pigment,1.-exp(-max(0.,tau))),background.a);
      #include <colorspace_fragment>
    }`
};
