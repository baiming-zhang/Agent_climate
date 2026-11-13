import * as THREE from 'three';
async function data(file,Type){const r=await fetch(file);if(!r.ok)throw Error('Building data unavailable');return new Type(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
export async function createBuildingLayer(scene,url,verticalScale){
 const metadataURL=new URL(url,location.href),resolve=file=>new URL(file.split('/').at(-1),metadataURL).href;
 const meta=await(await fetch(metadataURL)).json(),coarse=await data(resolve(meta.coarse.file),Float32Array),material=new THREE.MeshStandardMaterial({color:'#dce2d2',roughness:.95,flatShading:true}),unit=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D(),tiles=[];
 if(coarse.length!==meta.coarse.shape[0]*7)throw Error('Real footprint LOD shape mismatch');
 for(const t of meta.tiles){const mesh=new THREE.InstancedMesh(unit,material,t.count);for(let j=0;j<t.count;j++){const i=(t.coarse_start+j)*7;dummy.position.set(coarse[i],(coarse[i+2]+coarse[i+5]/2)*.001*verticalScale,-coarse[i+1]);dummy.rotation.set(0,coarse[i+6],0);dummy.scale.set(coarse[i+3],coarse[i+5]*.001*verticalScale,coarse[i+4]);dummy.updateMatrix();mesh.setMatrixAt(j,dummy.matrix);}mesh.instanceMatrix.needsUpdate=true;mesh.name='Real footprint far LOD '+t.tile;mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(t.centre_east_north_km[0],0,-t.centre_east_north_km[1]),8);scene.add(mesh);tiles.push({meta:t,coarse:mesh,detail:null,pending:false});}
 let last=0,loading=0;const cache=new Map(),stats={actual_building_parts:meta.display_building_parts,height_policy:meta.height_policy,source_stats:meta.stats,detailed_tiles_loaded:0,source:'Overture Maps '+meta.actual_source_dataset.release,physics_changed:false};
 async function detail(t){t.pending=true;loading++;
  try{const[p,o,b]=await Promise.all([data(resolve(t.meta.points.file),Float32Array),data(resolve(t.meta.offsets.file),Uint32Array),data(resolve(t.meta.base_roof.file),Float32Array)]);if(o.length!==t.meta.count+1||b.length!==2*t.meta.count)throw Error('Detailed building shape mismatch');const chunks=[];let size=0;
   for(let i=0;i<t.meta.count;i++){const points=[];for(let k=o[i];k<o[i+1];k++)points.push(new THREE.Vector2(p[k*2],p[k*2+1]));const shape=new THREE.Shape(points);let g=new THREE.ExtrudeGeometry(shape,{depth:(b[i*2+1]-b[i*2])*.001*verticalScale,bevelEnabled:false,steps:1});g.rotateX(-Math.PI/2);g.translate(0,b[i*2]*.001*verticalScale,0);if(g.index)g=g.toNonIndexed();chunks.push(g);size+=g.attributes.position.array.length;}
   const positions=new Float32Array(size),normals=new Float32Array(size);let off=0;for(const g of chunks){positions.set(g.attributes.position.array,off);normals.set(g.attributes.normal.array,off);off+=g.attributes.position.array.length;g.dispose();}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('normal',new THREE.BufferAttribute(normals,3));t.detail=new THREE.Mesh(g,material);t.detail.name='Actual outer footprint detail '+t.meta.tile;t.detail.visible=!!t.wanted;t.coarse.visible=!t.wanted;scene.add(t.detail);cache.set(t.meta.tile,t);stats.detailed_tiles_loaded=cache.size;
  }catch(e){stats.last_detail_error=e.message;console.error(e);}finally{t.pending=false;loading--;}
 }
 function update(camera,controls){if(performance.now()-last<450)return;last=performance.now();const d=camera.position.distanceTo(controls.target),near=d<12?tiles.map(t=>({t,d:Math.hypot(t.meta.centre_east_north_km[0]-controls.target.x,t.meta.centre_east_north_km[1]+controls.target.z)})).filter(x=>x.d<6).sort((a,b)=>a.d-b.d).slice(0,d<2?4:2):[],wanted=new Set(near.map(x=>x.t.meta.tile));
  for(const t of tiles){const show=wanted.has(t.meta.tile);t.wanted=show;t.coarse.visible=!(show&&t.detail);if(t.detail)t.detail.visible=show;}
  for(const{t}of near)if(!t.detail&&!t.pending&&loading<2)detail(t);
  if(cache.size>6)for(const[k,t]of cache)if(!wanted.has(k)&&cache.size>6){scene.remove(t.detail);t.detail.geometry.dispose();t.detail=null;t.coarse.visible=true;cache.delete(k);}stats.detailed_tiles_loaded=cache.size;
 }
 return{...stats,stats,update,metadata:meta};
}
