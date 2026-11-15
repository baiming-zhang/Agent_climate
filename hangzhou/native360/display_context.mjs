// Read-only geographic context. It does not enter the particle model or wind.
import * as THREE from 'three';
export async function addDisplayContext(scene,meta,world,terrainHeight=null){
 if(!meta.display_context)return{rendered_footprints:0};
 const response=await fetch('./osm_context.json');if(!response.ok)throw Error('Geographic display context unavailable');
 const data=await response.json();let count=0;
 for(const way of data.elements){
  if(way.type!=='way'||!way.geometry||way.geometry.length<4)continue;
  const a=way.geometry[0],b=way.geometry.at(-1);if(a.lon!==b.lon||a.lat!==b.lat)continue;
  const tag=way.tags||{},kind=tag.building?'building':tag.natural==='water'||tag.waterway==='riverbank'?'water':'industrial';
  if(terrainHeight){
   const points=[];
   for(let i=1;i<way.geometry.length;i++){
    const a=way.geometry[i-1],b=way.geometry[i],wa=world(a.lon,a.lat),wb=world(b.lon,b.lat),steps=Math.max(1,Math.ceil(Math.hypot(wb[0]-wa[0],wb[1]-wa[1])/.1));
    for(let j=0;j<steps;j++){const t=j/steps,lon=a.lon+t*(b.lon-a.lon),lat=a.lat+t*(b.lat-a.lat),h=terrainHeight(lon,lat);if(h===null)continue;const[e,n]=world(lon,lat);points.push(new THREE.Vector3(e,(h+.2)*meta.vertical_display_exaggeration*.001,-n));}
   }
   if(points.length>2){const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:{building:'#667d6d',water:'#779faa',industrial:'#9aa79d'}[kind],depthWrite:false}));line.name=`OSM ${kind} footprint ${way.id}`;line.userData={display_context_only:true,OSM_id:way.id,building_height_unknown:true};scene.add(line);count++;}
   continue;
  }
  const points=way.geometry.map(p=>new THREE.Vector2(...world(p.lon,p.lat))),shape=new THREE.Shape(points);
  const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:{building:'#829187',water:'#9ebdc5',industrial:'#c0c9c2'}[kind],side:THREE.DoubleSide}));
  mesh.rotation.x=-Math.PI/2;mesh.position.y=kind==='building'?.001:kind==='water'?.0007:.0004;
  mesh.name=`OSM ${kind} footprint ${way.id}`;mesh.userData={display_context_only:true,OSM_id:way.id,building_height_unknown:true};scene.add(mesh);count++;
 }
 return{rendered_footprints:count,building_height_extrusion:false,source:'OpenStreetMap',scientific_fields_modified:false};
}
