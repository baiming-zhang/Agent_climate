import * as THREE from 'three';

// Display the actual frozen model ground. Never move a scientific source to
// conceal the difference between its original reference and mesh interpolation.
export async function loadActualModelTerrainV8(metadataURL,{world,verticalScale=1.8,expectedTrace}={}){
 const request=await fetch(metadataURL);if(!request.ok)throw Error(`Model terrain metadata HTTP ${request.status}`);
 const meta=await request.json(),base=new URL('.',new URL(metadataURL,location.href));
 if(meta.schema!=='hangzhou-v8-frozen-model-display-terrain-v1'||(expectedTrace&&meta.source_plume_trace_SHA256!==expectedTrace))throw Error('Wrong frozen model terrain/source lineage');
 const r=await fetch(new URL(meta.file,base));if(!r.ok)throw Error(`Model terrain HTTP ${r.status}`);
 const buffer=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 if(buffer.byteLength!==meta.raw_bytes)throw Error('Model terrain data shape mismatch');
 const data=new Float64Array(buffer),[ny,nx]=meta.shape,xs=meta.longitude_nodes,ys=meta.latitude_nodes;
 if(nx!==xs.length||ny!==ys.length||data.length!==nx*ny)throw Error('Model terrain coordinate shape mismatch');
 function height(lon,lat){
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon<xs[0]||lon>xs.at(-1)||lat<ys[0]||lat>ys.at(-1))return null;
  const index=(nodes,value)=>{let lo=0,hi=nodes.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(value<nodes[m])hi=m;else lo=m;}return lo;};
  const i=index(xs,lon),j=index(ys,lat),a=(lon-xs[i])/(xs[i+1]-xs[i]),b=(lat-ys[j])/(ys[j+1]-ys[j]);
  return (1-a)*(1-b)*data[j*nx+i]+a*(1-b)*data[j*nx+i+1]+(1-a)*b*data[(j+1)*nx+i]+a*b*data[(j+1)*nx+i+1];
 }
 // This source-aware display mesh has nonuniform axes. The scientific volume
 // must use its own actual native grid/terrain texture, not uniform UVs here.
 const extraX=meta.source_alignment.map(s=>s.longitude),extraY=meta.source_alignment.map(s=>s.latitude);
 const gx=Array.from(new Set([...xs,...extraX])).sort((a,b)=>a-b),gy=Array.from(new Set([...ys,...extraY])).sort((a,b)=>a-b);
 const positions=new Float32Array(gx.length*gy.length*3),colors=new Float32Array(positions.length),indices=new Uint32Array((gx.length-1)*(gy.length-1)*6);let cursor=0;
 const low=new THREE.Color('#c4cfcb'),high=new THREE.Color('#687d7a'),color=new THREE.Color();
 for(let j=0;j<gy.length;j++)for(let i=0;i<gx.length;i++){const p=world(gx[i],gy[j]),k=(j*gx.length+i)*3,h=height(gx[i],gy[j]);positions.set([p[0],h*.001*verticalScale,-p[1]],k);color.copy(low).lerp(high,Math.pow(Math.max(0,Math.min(1,(h-meta.minimum_m)/Math.max(1,meta.maximum_m-meta.minimum_m))),.65));colors.set(color.toArray(),k);}
 for(let j=0;j<gy.length-1;j++)for(let i=0;i<gx.length-1;i++){const a=j*gx.length+i,b=a+1,c=a+gx.length,d=c+1;indices.set([a,b,c,b,d,c],cursor);cursor+=6;}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:1,side:THREE.DoubleSide});const mesh=new THREE.Mesh(geometry,material);mesh.name='Frozen WRF HGT · interpolated display surface';
 const sourceAlignment=meta.source_alignment.map(s=>{const i=gx.indexOf(s.longitude),j=gy.indexOf(s.latitude);return{...s,actual_mesh_ground_MSL_m:positions[(j*gx.length+i)*3+1]/verticalScale*1000};});
 return{meta,mesh,height,shape:[ny,nx],min:world(xs[0],ys[0]),max:world(xs.at(-1),ys.at(-1)),sourceAlignment,physical_model_terrain_modified:false,source_positions_modified:false,nativeVolumeGroundTextureMustComeFromNativeManifest:true,displayPalette:'Fixed grey height palette from actual HGT; geometry and model elevations unchanged.'};
}
