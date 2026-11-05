import * as THREE from 'three';
import {createNearSource} from './near_source_r07.js?v=r07';
export async function createNearSources(renderer,scene,depth,camera){
 const r=await fetch('data/sources_r07.json.gz');if(!r.ok)throw Error('Three-source weather calculations missing');
 const data=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json(),sources=[];
 for(const d of data.sources)sources.push(await createNearSource(renderer,scene,depth,camera,d));
 let focus=0,colour=data.default_colour;
 const u=data.UBC,ubc=new THREE.Vector3(u.world_east_north_km[0],u.display_ground_m*.001*1.8,-u.world_east_north_km[1]),decal=u.ground_decal,[nx,ny]=decal.shape,geometry=new THREE.BufferGeometry(),uv=[],indices=[];
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){uv.push(i/(nx-1),1-j/(ny-1));if(i<nx-1&&j<ny-1){const k=i+j*nx;indices.push(k,k+nx,k+1,k+1,k+nx,k+nx+1);}}
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(decal.positions.flat(),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 const crest=await new THREE.TextureLoader().loadAsync('assets/ubc_official_sprite_2x.png');crest.colorSpace=THREE.SRGBColorSpace;crest.offset.set(5/3000,1-155/1200);crest.repeat.set(96/3000,131/1200);crest.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
 const campusMark=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:crest,transparent:true,alphaTest:.04,depthWrite:false,depthTest:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));campusMark.name='UBC official crest geographic ground decal / not floating';campusMark.renderOrder=2;scene.add(campusMark);
 const api={data,sources,update(t,m,g){for(const s of sources)s.update(t,m,g);},choose(i){for(const s of sources)s.choose(i);},setDriver(v){for(const s of sources)s.setDriver(v);},setColour(v){colour=v;for(const s of sources)s.setColour(v);},
 sample(p){return sources.reduce((a,s)=>a+s.sample(p),0);},probe(ray,end){return sources.map(s=>s.probe(ray,end)).filter(Boolean).sort((a,b)=>b.ppb-a.ppb)[0]||null;},
 render(){for(const s of sources)s.render();},view(controls){sources[focus].view(controls);},focus(key,controls){focus=Math.max(0,sources.findIndex(s=>s.data.key===key));sources[focus].view(controls);},
 all(controls){const center=sources.reduce((v,s)=>v.add(s.source),new THREE.Vector3()).multiplyScalar(1/3);controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(5,19,23));controls.update();},
 campus(controls){controls.target.copy(ubc);camera.position.copy(ubc).add(new THREE.Vector3(-1.9,2.6,3.5));controls.update();},
 marker(){campusMark.visible=document.getElementById('ubc').checked;},get campusDecal(){return campusMark},
 get record(){return sources[focus].record},get state(){const states=sources.map(s=>s.state);return {...states[focus],sourceCount:sources.length,puffCount:states.reduce((a,s)=>a+s.puffCount,0),mass_kg:states.reduce((a,s)=>a+s.mass_kg,0),wet_removed_kg:states.reduce((a,s)=>a+s.wet_removed_kg,0),emitted_kg:states.reduce((a,s)=>a+s.emitted_kg,0),sources:states,colour};}};
 api.setColour(colour);return api;
}
