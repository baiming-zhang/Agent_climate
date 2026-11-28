import * as THREE from 'three';
import {createBuildingLayerV8} from './building_layer_v8.mjs';

// Presentation assets from the existing city renderer, never wind/CFD inputs.
export async function addActualCityContextV8({scene,metadataURL,terrain,world,origin,kmPerDegree,verticalScale=1.8}){
 const response=await fetch(metadataURL);if(!response.ok)throw Error(`City context HTTP ${response.status}`);
 const context=await response.json(),base=new URL(metadataURL,location.href);
 const asset=file=>new URL(file.startsWith('../geography/')?file.slice('../geography/'.length):file,base).href;
 const c=context.landcover;if(c){
  const r=await fetch(asset(c.file));if(!r.ok)throw Error('Actual geographic cover unavailable');
  const raw=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();if(raw.byteLength!==c.shape[0]*c.shape[1]*4)throw Error('City cover shape mismatch');
  const texture=new THREE.DataTexture(new Uint8Array(raw),c.shape[1],c.shape[0],THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.needsUpdate=true;
  const vertices=terrain.mesh.geometry.attributes.position.array,uv=new Float32Array(vertices.length/3*2);
  for(let i=0;i<vertices.length/3;i++){const lon=vertices[3*i]/kmPerDegree[0]+origin[0],lat=-vertices[3*i+2]/kmPerDegree[1]+origin[1];uv[2*i]=(lon-c.bbox[0])/(c.bbox[2]-c.bbox[0]);uv[2*i+1]=(lat-c.bbox[1])/(c.bbox[3]-c.bbox[1]);}
  terrain.mesh.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));const material=terrain.mesh.material;material.map=texture;
  material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
   if(all(greaterThanEqual(vMapUv,vec2(0.)))&&all(lessThanEqual(vMapUv,vec2(1.))))diffuseColor*=texture2D(map,vMapUv);
   #endif`);};material.needsUpdate=true;
 }
 let buildings=null;
 if(context.buildings)buildings=await createBuildingLayerV8(scene,asset(context.buildings),verticalScale,{groundAtWorld:(east,north)=>terrain.height(east/kmPerDegree[0]+origin[0],north/kmPerDegree[1]+origin[1])});
 else if(context.OSM){
  const merged=new Map();for(const file of context.OSM.files){const r=await fetch(asset(file));if(!r.ok)throw Error('Actual footprint context unavailable');for(const way of(await r.json()).elements)if(way.type==='way')merged.set(way.id,way);}
  let count=0,tagged=0,levels=0,schematic=0;
  for(const way of merged.values()){
   if(!way.tags?.building||!way.geometry||way.geometry.length<4)continue;const ring=way.geometry.slice(0,-1),heights=ring.map(p=>terrain.height(p.lon,p.lat));if(heights.some(h=>h===null))continue;
   let h=parseFloat(way.tags.height);if(Number.isFinite(h)&&h>0&&h<500){if(/ft|feet/i.test(way.tags.height))h*=.3048;tagged++;}
   else{const n=parseFloat(way.tags['building:levels']);if(Number.isFinite(n)&&n>0&&n<150){h=n*3;levels++;}else{h=context.OSM.fallback_height_m;schematic++;}}
   const shape=new THREE.Shape(ring.map(p=>new THREE.Vector2(...world(p.lon,p.lat)))),geometry=new THREE.ExtrudeGeometry(shape,{depth:h*.001*verticalScale,bevelEnabled:false,steps:1});geometry.rotateX(-Math.PI/2);geometry.translate(0,Math.min(...heights)*.001*verticalScale,0);
   const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#d9dfdc',roughness:.95}));mesh.name='Actual OSM footprint · untagged height schematic';scene.add(mesh);count++;
  }buildings={rendered_buildings:count,tagged_height:tagged,levels_height:levels,schematic_height:schematic,update(){}};
 }
 return{context,buildings,update:(camera,controls)=>buildings?.update?.(camera,controls),source:'Existing historical geographic context; new frozen model-ground placement.',building_flow_resolved:false,scientific_fields_changed:false};
}
