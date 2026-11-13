import * as THREE from 'three';
import {halfBits} from './display_codec.mjs';
import {temporalScalar} from './temporal_scalar.mjs';
async function unpack(url){const r=await fetch(url);if(!r.ok)throw Error(`HTTP${r.status}: ${url}`);const a=await r.arrayBuffer(),u=new Uint8Array(a);return u[0]===31&&u[1]===139?new Response(new Blob([a]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():a;}
export async function loadFieldData(meta){
 const [nt,nz,ny,nx]=meta.shape,frames=await Promise.all(meta.display.frames.map(async f=>{const a=new Uint8Array(await unpack(f.file));if(a.length!==nz*ny*nx)throw Error('Wrong graphics frame shape');return a;}));
 const lut=Float32Array.from({length:256},(_,i)=>meta.display.scale_value*Math.expm1(i/255*meta.display.log_max)),half=Uint16Array.from(lut,halfBits),tiles=new Map(),cache=new Map();
 for(const t of meta.query.tiles)tiles.set(`${t.day}:${t.tile_y}:${t.tile_x}`,t);
 function texture(index){const q=frames[index],a=new Uint16Array(q.length*2);for(let i=0;i<q.length;i++)a[2*i]=half[q[i]];const t=new THREE.Data3DTexture(a,nx,ny,nz);t.format=THREE.RGFormat;t.type=THREE.HalfFloatType;t.minFilter=t.magFilter=THREE.LinearFilter;t.unpackAlignment=1;t.needsUpdate=true;return t;}
 function time(h){const x=Math.max(0,Math.min(nt-1,(h-12)/24)),a=Math.floor(x),b=Math.min(nt-1,a+1);return{p:Math.max(0,a-1),a,b,n:Math.min(nt-1,b+1),weight:x-a};}
 function displayAt(lon,lat,z,h){const xs=meta.display_longitudes,ys=meta.display_latitudes,ix=Math.round((lon-xs[0])/(xs[1]-xs[0])),iy=Math.round((lat-ys[0])/(ys[1]-ys[0])),iz=meta.z_edges_m.findIndex((a,k)=>z>=a&&z<meta.z_edges_m[k+1]);if(ix<0||iy<0||ix>=nx||iy>=ny||iz<0)return 0;const i=(iz*ny+iy)*nx+ix,t=time(h);return temporalScalar(lut[frames[t.p][i]],lut[frames[t.a][i]],lut[frames[t.b][i]],lut[frames[t.n][i]],t.weight);}
 async function column(lon,lat,h){if(meta.query.mode==='none')return null;const xs=meta.query.longitudes,ys=meta.query.latitudes,ix=Math.round((lon-xs[0])/(xs[1]-xs[0])),iy=Math.round((lat-ys[0])/(ys[1]-ys[0]));if(ix<0||iy<0||ix>=xs.length||iy>=ys.length)return null;const day=Math.max(0,Math.min(nt-1,Math.floor(h/24))),key=`${day}:${Math.floor(iy/64)}:${Math.floor(ix/64)}`,f=tiles.get(key);if(!f)throw Error('Query tile missing');if(!cache.has(key))cache.set(key,unpack('../query/'+f.file).then(b=>{const a=new Float64Array(b);if(a.length!==f.shape.reduce((x,y)=>x*y,1))throw Error('Wrong query tile shape');return a;}));const a=await cache.get(key);if(cache.size>8)for(const old of cache.keys())if(old!==key){cache.delete(old);break;}const [,ty,tx]=f.shape,lx=ix%64,ly=iy%64;return{day,ix,iy,value:k=>a[(k*ty+ly)*tx+lx]};}
 async function sample(lon,lat,z,h,fixedSurface=false){const c=await column(lon,lat,h);if(!c)return null;const ze=meta.z_edges_m;let iz=ze.findIndex((a,k)=>z>=a&&z<ze[k+1]);if(iz<0)return null;let value=c.value(iz),layer=[ze[iz],ze[iz+1]];
  if(fixedSurface){value=0;for(let k=0;k<ze.length-1;k++)value+=c.value(k)*Math.max(0,Math.min(25,ze[k+1])-Math.max(0,ze[k]))/25;layer=[0,25];iz=-1;}
  if(!Number.isFinite(value)||value<0)throw Error('Invalid query value; do not clip science');return{value,unit:meta.units,day:c.day+1,cell:[c.ix,c.iy,iz],layer,period_hours:[c.day*24,(c.day+1)*24],query_grid_m:meta.query.grid_m,original_grid_m:meta.original_grid_m,type:meta.query.description};
 }
 return{texture,time,displayAt,sample,frames_ready:frames.length};
}
