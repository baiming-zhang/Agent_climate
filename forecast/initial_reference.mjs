import * as THREE from 'three';
import {worldLonLat} from '../ground.js';
export async function loadInitialReference(bytes){
 const root='./data/initial_reference/',meta=await(await fetch(root+'metadata.json')).json();
 const native=new Float32Array(await bytes(root+meta.native_file)),values=new Float32Array(await bytes(root+meta.display_file));
 const [nz,ny,nx]=meta.display_shape_z_y_x_fields,half=Uint16Array.from(values,v=>THREE.DataUtils.toHalfFloat(v));
 const texture=new THREE.Data3DTexture(half,nx,ny,nz);texture.format=THREE.RGFormat;texture.type=THREE.HalfFloatType;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.unpackAlignment=1;texture.needsUpdate=true;
 function query(world){
  const [lon,lat]=worldLonLat(world,meta.origin_UTM10N_m),xs=meta.native_longitudes,ys=meta.native_latitudes;
  if(lon<xs[0]||lon>xs.at(-1)||lat<ys[0]||lat>ys.at(-1))return null;
  const x=(lon-xs[0])/(xs.at(-1)-xs[0])*(xs.length-1),y=(lat-ys[0])/(ys.at(-1)-ys[0])*(ys.length-1),i=Math.min(xs.length-2,Math.floor(x)),j=Math.min(ys.length-2,Math.floor(y)),a=x-i,b=y-j;
  let ppb=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)ppb+=native[(j+dy)*xs.length+i+dx]*(dx?a:1-a)*(dy?b:1-b);
  return{ppb,lon,lat,static_initial_reference:true,valid_UTC:meta.valid_UTC,not_future_transport:true};
 }
 return{meta,query,entry:{reference:true,index:0,texture,values}};
}
