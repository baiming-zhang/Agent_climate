import * as THREE from 'three';
import {createBuildingLayer} from './building_layer.mjs';
// Reuse Vancouver's footprint-extrusion policy with actual Hangzhou geometry.
// Unknown heights are explicitly schematic, never solver or airflow inputs.
export async function addCityGeography(scene,meta,world,terrain){
 if(terrain?.geographicContext?.buildings)return createBuildingLayer(scene,terrain.geographicContext.buildings,meta.vertical_display_exaggeration);
 const policy=terrain?.geographicContext?.OSM;if(!policy)return null;
 const elements=new Map();for(const file of policy.files){const r=await fetch(file);if(!r.ok)throw Error('City geometry unavailable');for(const e of(await r.json()).elements)if(e.type==='way')elements.set(e.id,e);}
 const chunks=[];let knownHeight=0,levelsHeight=0,schematic=0,footprints=0;
 for(const e of elements.values()){
  if(!e.tags?.building||!e.geometry||e.geometry.length<4)continue;const a=e.geometry[0],b=e.geometry.at(-1);if(a.lon!==b.lon||a.lat!==b.lat)continue;
  const points=e.geometry.slice(0,-1);const grounds=points.map(p=>terrain.height(p.lon,p.lat));if(grounds.some(h=>h===null))continue;
  let h=parseFloat(e.tags.height);if(Number.isFinite(h)&&h>0&&h<500){if(/ft|feet/i.test(e.tags.height))h*=.3048;knownHeight++;}
  else{const levels=parseFloat(e.tags['building:levels']);if(Number.isFinite(levels)&&levels>0&&levels<150){h=levels*3;levelsHeight++;}else{h=policy.fallback_height_m;schematic++;}}
  const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(...world(p.lon,p.lat)))),base=Math.min(...grounds),top=Math.max(...grounds)+h;
  let g=new THREE.ExtrudeGeometry(shape,{depth:(top-base)*meta.vertical_display_exaggeration*.001,bevelEnabled:false,steps:1});g.rotateX(-Math.PI/2);g.translate(0,base*meta.vertical_display_exaggeration*.001,0);if(g.index)g=g.toNonIndexed();chunks.push(g);footprints++;
 }
 if(chunks.length){
  const size=chunks.reduce((n,g)=>n+g.attributes.position.array.length,0),positions=new Float32Array(size),normals=new Float32Array(size);let i=0;for(const g of chunks){positions.set(g.attributes.position.array,i);normals.set(g.attributes.normal.array,i);i+=g.attributes.position.array.length;g.dispose();}
  const merged=new THREE.BufferGeometry();merged.setAttribute('position',new THREE.BufferAttribute(positions,3));merged.setAttribute('normal',new THREE.BufferAttribute(normals,3));const mesh=new THREE.Mesh(merged,new THREE.MeshStandardMaterial({color:'#dfe3d6',roughness:.9,flatShading:true}));mesh.name='Actual OSM building footprints; untagged heights schematic';mesh.userData.physical_model_input=false;scene.add(mesh);
 }
 return{rendered_buildings:footprints,tagged_height:knownHeight,levels_times3m:levelsHeight,schematic_6m_heights:schematic,footprints:'Actual OSM geometry',building_height_policy:policy.height_policy,airflow_or_transport_modified:false};
}
