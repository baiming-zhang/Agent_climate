import * as THREE from 'three';
import {reportingTime} from './display_scalar_v8.mjs';
import {decodePlumeGeometryWords} from './plume_geometry_codec_v8.mjs';
import {makePlumeGeometryShader} from './plume_geometry_shader_v8.mjs';

export async function createActualPlumeVolume({metadataURL,expectedTrace,world,scene,verticalScale=1.8,uniforms}){
  const r=await fetch(metadataURL);if(!r.ok)throw Error(`Plume metadata HTTP ${r.status}`);
  const meta=await r.json();
  if(meta.schema!=='hangzhou-v8-plume-coordinate-words-v1'||!meta.full360_pack||meta.actual_reporting_hours!==360||meta.trace_sha256!==expectedTrace)throw Error('Incomplete or mismatched actual plume component');
  const base=new URL('.',new URL(metadataURL,location.href)),frames=new Map(),pending=new Map(),compressed=new Map(),downloads=new Map();let current=null,enabled=true;
  const origins=[],projections=[];
  for(const s of meta.sources){
    const p=world(s.lon,s.lat),east=world(s.lon+1/s.east_m_per_degree,s.lat),north=world(s.lon,s.lat+1/111195);
    origins.push(new THREE.Vector3(p[0]*1000,p[1]*1000,s.model_source_base_MSL_m));
    projections.push(new THREE.Vector4((east[0]-p[0])*1000,(east[1]-p[1])*1000,(north[0]-p[0])*1000,(north[1]-p[1])*1000));
  }
  const shader=makePlumeGeometryShader({sourceCount:meta.sources.length,verticalScale});
  const box=new THREE.BoxGeometry(2,2,2);
  async function packed(entry){
    if(compressed.has(entry.file))return compressed.get(entry.file);
    if(downloads.has(entry.file))return downloads.get(entry.file);
    const task=(async()=>{const response=await fetch(new URL(entry.file,base));if(!response.ok)throw Error(`Plume interval HTTP ${response.status}`);const raw=await response.arrayBuffer();compressed.set(entry.file,raw);return raw;})();
    downloads.set(entry.file,task);try{return await task;}finally{downloads.delete(entry.file);}
  }
  async function load(index){
    if(frames.has(index))return frames.get(index);
    if(pending.has(index))return pending.get(index);
    const promise=(async()=>{
      const entry=meta.frame_files.find(f=>f.hour===index);if(!entry)throw Error('Missing actual plume interval');
      let raw=await packed(entry);const bytes=new Uint8Array(raw);
      if(bytes[0]===31&&bytes[1]===139)raw=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const values=decodePlumeGeometryWords(raw,entry,meta);
      const geometry=new THREE.InstancedBufferGeometry();geometry.index=box.index;geometry.attributes.position=box.attributes.position;
      const buffer=new THREE.InstancedInterleavedBuffer(values,9,1);
      for(const[name,size,offset]of [['sourceIndex',1,0],['cylinderStart',3,1],['cylinderEnd',3,4],['cylinderRadius',1,7],['meanConcentration',1,8]])geometry.setAttribute(name,new THREE.InterleavedBufferAttribute(buffer,size,offset));
      geometry.instanceCount=entry.records;
      const material=new THREE.ShaderMaterial({vertexShader:shader.vertex,fragmentShader:shader.fragment,glslVersion:THREE.GLSL3,
        uniforms:{...uniforms,sourceOrigins:{value:origins},sourceProjections:{value:projections},densityWeight:{value:0},enabled:{value:enabled?1:0}},
        side:THREE.BackSide,depthTest:false,depthWrite:false,transparent:true,
        blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor});
      const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.visible=false;mesh.name=`Actual interval${index} plume residence scalar`;scene.add(mesh);
      const frame={index,values,geometry,material,mesh};frames.set(index,frame);return frame;
    })();
    pending.set(index,promise);try{return await promise;}finally{pending.delete(index);}
  }
  async function prepare(hours){const t=reportingTime(hours,360);await Promise.all([...new Set([t.a,t.b])].map(load));return t;}
  async function preload({onProgress}={}){
    let cursor=0,done=0;async function worker(){while(cursor<meta.frame_files.length){const entry=meta.frame_files[cursor++];await packed(entry);done++;onProgress?.({done,total:meta.frame_files.length});}}
    await Promise.all([worker(),worker(),worker(),worker()]);
    return {compressed_intervals:compressed.size,decoded_geometry_frames:frames.size,scientific_values_changed:false};
  }
  function commit(hours){
    const t=reportingTime(hours,360);if(!frames.has(t.a)||!frames.has(t.b))throw Error('Actual plume scalar frames not prepared');
    for(const f of frames.values()){f.mesh.visible=false;f.material.uniforms.densityWeight.value=0;}
    frames.get(t.a).mesh.visible=true;frames.get(t.a).material.uniforms.densityWeight.value=t.a===t.b?1:1-t.weight;
    if(t.b!==t.a){frames.get(t.b).mesh.visible=true;frames.get(t.b).material.uniforms.densityWeight.value=t.weight;}
    current=t;
    // Dispose old GPU geometry as ordinary cache management; no job is stopped.
    for(const[index,f]of frames)if(frames.size>6&&index!==t.a&&index!==t.b){scene.remove(f.mesh);f.geometry.dispose();f.material.dispose();frames.delete(index);}
  }
  function setEnabled(value){enabled=!!value;for(const f of frames.values())f.material.uniforms.enabled.value=enabled?1:0;}
  function sample(lon,lat,heightMSL){
    if(!current)return null;let value=0,contributors=0;
    for(const[index,weight]of [[current.a,current.a===current.b?1:1-current.weight],[current.b,current.a===current.b?0:current.weight]]){
      if(weight<=0)continue;
      const data=frames.get(index).values;
      for(let i=0;i<data.length;i+=9){
        const s=meta.sources[Math.round(data[i])],x=(lon-s.lon)*s.east_m_per_degree,y=(lat-s.lat)*111195,z=heightMSL-s.model_source_base_MSL_m;
        const dx=data[i+4]-data[i+1],dy=data[i+5]-data[i+2],dz=data[i+6]-data[i+3],length2=dx*dx+dy*dy+dz*dz;
        if(length2<=0)continue;
        const ox=x-data[i+1],oy=y-data[i+2],oz=z-data[i+3],t=(ox*dx+oy*dy+oz*dz)/length2;
        if(t<0||t>1)continue;
        const rx=ox-t*dx,ry=oy-t*dy,rz=oz-t*dz;
        if(rx*rx+ry*ry+rz*rz<=data[i+7]*data[i+7]){value+=weight*data[i+8];contributors++;}
      }
    }
    return {value,units:'ug m-3',contributors,role:'Actual integral-plume residence reconstruction; separate from the native regional cell/hour mean.'};
  }
  function pickRay(origin,direction,maximumDistanceKm=Infinity){
    if(!current||!enabled)return null;
    const rays=origins.map((s,i)=>{const p=projections[i],det=p.x*p.w-p.y*p.z;if(!det)throw Error('Degenerate source display projection');
      const x=origin.x*1000-s.x,n=-origin.z*1000-s.y,dx=direction.x*1000,dn=-direction.z*1000;
      return {o:[(p.w*x-p.z*n)/det,(-p.y*x+p.x*n)/det,origin.y*1000/verticalScale-s.z],d:[(p.w*dx-p.z*dn)/det,(-p.y*dx+p.x*dn)/det,direction.y*1000/verticalScale]};});
    let nearest=maximumDistanceKm,picked=null;
    for(const[index,weight]of [[current.a,current.a===current.b?1:1-current.weight],[current.b,current.a===current.b?0:current.weight]]){
      if(weight<=0)continue;const a=frames.get(index).values;
      for(let i=0;i<a.length;i+=9){
        if(a[i+8]<=0)continue;const source=Math.round(a[i]),ray=rays[source],sx=a[i+4]-a[i+1],sy=a[i+5]-a[i+2],sz=a[i+6]-a[i+3],length=Math.hypot(sx,sy,sz);if(length<=0)continue;
        const ax=sx/length,ay=sy/length,az=sz/length,ox=ray.o[0]-a[i+1],oy=ray.o[1]-a[i+2],oz=ray.o[2]-a[i+3],dx=ray.d[0],dy=ray.d[1],dz=ray.d[2];
        const oa=ox*ax+oy*ay+oz*az,da=dx*ax+dy*ay+dz*az,A=Math.max(0,dx*dx+dy*dy+dz*dz-da*da),B=ox*dx+oy*dy+oz*dz-oa*da,C=ox*ox+oy*oy+oz*oz-oa*oa-a[i+7]*a[i+7];
        let first=-Infinity,last=Infinity;
        if(A<1e-12){if(C>0)continue;}else{const discriminant=B*B-A*C;if(discriminant<0)continue;const r=Math.sqrt(discriminant);first=(-B-r)/A;last=(-B+r)/A;}
        if(Math.abs(da)<1e-12){if(oa<0||oa>length)continue;}else{const t0=-oa/da,t1=(length-oa)/da;first=Math.max(first,Math.min(t0,t1));last=Math.min(last,Math.max(t0,t1));}
        first=Math.max(0,first);last=Math.min(maximumDistanceKm,last);if(last<=first||first>=nearest)continue;
        nearest=first;const t=(first+last)/2;picked={source_id:meta.sources[source].id,world_point_km:origin.clone().addScaledVector(direction,t),distance_km:t};
      }
    }return picked;
  }
  return {meta,prepare,commit,preload,setEnabled,sample,pickRay,frames,origins,projections,
    get memory(){return {compressed_intervals:compressed.size,decoded_geometry_frames:frames.size};},
    dispose(){for(const f of frames.values()){scene.remove(f.mesh);f.geometry.dispose();f.material.dispose();}frames.clear();compressed.clear();box.dispose();}};
}
