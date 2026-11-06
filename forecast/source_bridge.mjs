import * as THREE from 'three';

// Display-only source origins. Native concentration and mass are never edited.
// Overlapping analytic density kernels sample one continuous centreline;
// there are no hard sphere boundaries or independently moving bead markers.
export function createSourceBridge(overlay,sources,{depthTexture,renderer,sampleConcentration}){
 const segments=96,vertices=sources.length*(segments+1)*4;
 const positions=new Float32Array(vertices*3),tangents=new Float32Array(vertices*3);
 const corners=new Float32Array(vertices*2),widths=new Float32Array(vertices),lengths=new Float32Array(vertices),along=new Float32Array(vertices),densities=new Float32Array(vertices),transits=new Float32Array(vertices),indices=[];
 for(let s=0;s<sources.length;s++)for(let j=0;j<=segments;j++){
  const k=(s*(segments+1)+j)*4;corners.set([-1,-1,1,-1,-1,1,1,1],k*2);
  for(let v=0;v<4;v++)along[k+v]=Math.pow(j/segments,2);
  indices.push(k,k+1,k+2,k+1,k+3,k+2);
 }
 const geometry=new THREE.BufferGeometry();
 for(const [key,array,size]of [['position',positions,3],['tangent',tangents,3],['corner',corners,2],['width',widths,1],['lengthAlong',lengths,1],['along',along,1],['density',densities,1],['transit',transits,1]])geometry.setAttribute(key,new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage));
 geometry.setIndex(indices);
 const material=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,
  uniforms:{pigment:{value:new THREE.Vector3(.467,.490,.510)},flowClock:{value:0},depthMap:{value:depthTexture},resolution:{value:new THREE.Vector2()},displayGain:{value:.35}},
  vertexShader:`attribute vec3 tangent;attribute vec2 corner;attribute float width,lengthAlong,along,density,transit;varying vec2 crossSection;varying float pathT,strength,travelSeconds;void main(){vec3 view=normalize(cameraPosition-position),right=cross(tangent,view);if(dot(right,right)<.00001)right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);right=normalize(right);vec3 up=normalize(cross(view,right));vec3 p=position+right*corner.x*width+up*corner.y*lengthAlong;crossSection=corner;pathT=along;strength=density;travelSeconds=transit;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
  fragmentShader:`uniform vec3 pigment;uniform float flowClock,displayGain;uniform sampler2D depthMap;uniform vec2 resolution;varying vec2 crossSection;varying float pathT,strength,travelSeconds;
  void main(){float depth=texture2D(depthMap,gl_FragCoord.xy/resolution).r;if(gl_FragCoord.z>depth+.00001)discard;float radial=exp(-4.5*dot(crossSection,crossSection));float handoff=1.-smoothstep(.42,1.,pathT);float movement=.88+.12*sin(6.2831853*(3.*pathT-3.*flowClock/travelSeconds));float optical=strength*radial*handoff*movement*displayGain/.35;float alpha=1.-exp(-optical);if(alpha<.001)discard;gl_FragColor=vec4(pigment,alpha);}`});
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=1;mesh.userData.nonQuery=true;mesh.name='Continuous source-origin density bridge, not native concentration';mesh.count=vertices;overlay.add(mesh);
 let flowClock=0,lastSeconds=null,diagnostics=[];
 const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
 function update(a,b,weight,seconds,pigment,playbackRate=1,gain=.35,cameraPosition){
  const dt=lastSeconds===null?0:THREE.MathUtils.clamp(seconds-lastSeconds,0,.1);lastSeconds=seconds;flowClock+=dt*playbackRate;
  material.uniforms.flowClock.value=flowClock;material.uniforms.pigment.value.set(pigment.r,pigment.g,pigment.b);material.uniforms.displayGain.value=gain;renderer.getDrawingBufferSize(material.uniforms.resolution.value);
  diagnostics=[];
  for(let sIndex=0;sIndex<sources.length;sIndex++){
   const s=sources[sIndex],p=s.hourly[a],q=s.hourly[b],mix=(k)=>p[k]*(1-weight)+q[k]*weight;
   const u=mix('u'),v=mix('v'),wind=Math.hypot(u,v),speed=Math.max(wind,.3),dx=wind>1e-6?u/wind:0,dz=wind>1e-6?-v/wind:0;
   const riseDistance=Math.max(30,mix('distance_m')||100),finalHeight=mix('final_height_m'),stackHeight=s.stack.height_AGL_m;
   const start=new THREE.Vector3(s.world_east_north_km[0],s.base+stackHeight*.001*1.8,-s.world_east_north_km[1]);
   const nominal=new THREE.Vector3(start.x+dx*(riseDistance*.001+.35),s.base+finalHeight*.001*1.8,start.z+dz*(riseDistance*.001+.35));
   // Soft concentration-weighted matching, never winner-takes-all snapping.
   const matched=new THREE.Vector3();let sum=0;
   for(const lateral of [-.3,0,.3])for(const height of [-.12,0,.12]){
    const candidate=nominal.clone().add(new THREE.Vector3(-dz*lateral,height,dx*lateral));
    const c=sampleConcentration(candidate)?.ppb||0,w=Math.max(0,c)*Math.exp(-2*(lateral*lateral/.09+height*height/.0144));
    matched.addScaledVector(candidate,w);sum+=w;
   }
   const cloudWeight=sum/(sum+.025),end=nominal.clone();if(sum>0)end.lerp(matched.multiplyScalar(1/sum),cloudWeight*.65);
   const joinConcentration=sampleConcentration(end)?.ppb||0;
   const nativeWidth=.20+.12*cloudWeight,physicalWidth=(s.stack.diameter_m*.5+.06*riseDistance)*.001;
   const farWidth=THREE.MathUtils.lerp(physicalWidth,nativeWidth,cloudWeight);
   const totalDistance=Math.hypot(end.x-start.x,end.z-start.z),riseEnd=Math.min(.85,riseDistance*.001/Math.max(totalDistance,.001));
   const transit=THREE.MathUtils.clamp(riseDistance/speed/240,.75,2.4),baseStrength=2.8*(s.kg_s/.004);
   const centres=[];
   for(let j=0;j<=segments;j++){
    const t=Math.pow(j/segments,2),r=THREE.MathUtils.clamp(t/Math.max(.1,riseEnd),0,1),zRise=THREE.MathUtils.lerp(Math.pow(r,2/3),1,smooth((r-.65)/.35));
    centres.push(new THREE.Vector3(THREE.MathUtils.lerp(start.x,end.x,t),start.y+(nominal.y-start.y)*zRise+(end.y-nominal.y)*smooth((t-.5)/.5),THREE.MathUtils.lerp(start.z,end.z,t)));
   }
   for(let j=0;j<=segments;j++){
    const t=Math.pow(j/segments,2),c=centres[j],before=centres[Math.max(0,j-1)],after=centres[Math.min(segments,j+1)],tangent=after.clone().sub(before).normalize();
    const radius=THREE.MathUtils.lerp(Math.max(.0015,s.stack.diameter_m*.0005),farWidth,Math.pow(t,1.5));
    const ds=(c.distanceTo(before)+c.distanceTo(after))*.5,view=cameraPosition.clone().sub(c).normalize(),projection=Math.sqrt(Math.max(0,1-Math.pow(tangent.dot(view),2)));
    const longitudinal=Math.max(radius,ds*projection*2.8),sigma=longitudinal/3,opticalWeight=ds/(Math.sqrt(2*Math.PI)*sigma);
    for(let side=0;side<4;side++){const k=(sIndex*(segments+1)+j)*4+side;positions.set(c.toArray(),k*3);tangents.set(tangent.toArray(),k*3);widths[k]=radius;lengths[k]=longitudinal;densities[k]=baseStrength/(1+7*t)*opticalWeight;transits[k]=transit;}
   }
   diagnostics.push({id:s.id,start:start.toArray(),end:end.toArray(),native_match_ppb:joinConcentration,cloud_weight:cloudWeight,near_width_km:Math.max(.0015,s.stack.diameter_m*.0005),far_width_km:farWidth,transit_display_seconds_at_1x:transit,terminal_guide_opacity:0});
  }
  for(const key of ['position','tangent','width','lengthAlong','density','transit'])geometry.attributes[key].needsUpdate=true;
 }
 return{mesh,update,get state(){return{flow_clock:flowClock,pigment:material.uniforms.pigment.value.toArray(),sources:diagnostics};}};
}
