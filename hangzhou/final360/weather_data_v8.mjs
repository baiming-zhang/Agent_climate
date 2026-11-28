import * as THREE from 'three';
import {reportingTime} from './display_scalar_v8.mjs';
import {temporalScalar} from './temporal_scalar.mjs';

function snapshotTime(hours,count){
 if(!Number.isFinite(hours)||hours<0||hours>count-1)throw Error('Weather time outside actual saved snapshots');
 const a=Math.min(count-1,Math.floor(hours)),b=Math.min(count-1,a+1);
 return {p:Math.max(0,a-1),a,b,n:Math.min(count-1,b+1),weight:hours-a};
}
function half(value){const sign=value&32768?-1:1,e=value>>10&31,m=value&1023;return sign*(e?2**(e-15)*(1+m/1024):2**-14*m/1024);}
function axis(values,value){
 if(!Number.isFinite(value)||value<values[0]||value>values.at(-1))return null;
 let lo=0,hi=values.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(value<values[mid])hi=mid;else lo=mid;}
 return {first:lo,next:hi,weight:(value-values[lo])/(values[hi]-values[lo])};
}

// These are diagnostic display fields from the actual frozen WRF output, not
// a second wind integration or replacement input for the running particles.
export async function loadActualWeatherV8(metadataURL,{expectedIntegritySHA256}={}){
 const response=await fetch(metadataURL);if(!response.ok)throw Error(`Weather metadata HTTP ${response.status}`);
 const meta=await response.json(),base=new URL('.',new URL(metadataURL,location.href));
 if(meta.schema!=='hangzhou-v8-frozen-weather-display-v1'||meta.actual_reporting_hours!==360||meta.actual_weather_states!==361||meta.report_start_lead_h!==10||meta.shape_zyx.join(',')!=='15,75,100')throw Error('Wrong V8 weather data/time geometry');
 if(expectedIntegritySHA256&&meta.source_weather_integrity_receipt_SHA256!==expectedIntegritySHA256)throw Error('Different frozen weather lineage');
 if(meta.frames[0].actual_UTC!=='2026-11-24_16:00:00')throw Error('Weather initialization/reporting interval mismatch');
 const [nz,ny,nx]=meta.shape_zyx,frames=new Map(),inflight=new Map(),cloudTextures=new Map(),rainTextures=new Map(),compressed=new Map(),downloads=new Map();
 async function packed(entry){
  if(compressed.has(entry.file))return compressed.get(entry.file);if(downloads.has(entry.file))return downloads.get(entry.file);
  const task=(async()=>{const r=await fetch(new URL(entry.file,base));if(!r.ok)throw Error(`Weather asset HTTP ${r.status}: ${entry.file}`);const a=await r.arrayBuffer();compressed.set(entry.file,a);return a;})();
  downloads.set(entry.file,task);try{return await task;}finally{downloads.delete(entry.file);}
 }
 async function bytes(entry){
  const a=await packed(entry);
  const raw=await new Response(new Blob([a]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(raw.byteLength!==entry.raw_bytes)throw Error('Weather asset shape mismatch');return raw;
 }
 async function load(index){
  if(frames.has(index))return frames.get(index);if(inflight.has(index))return inflight.get(index);
  const promise=(async()=>{
   const entry=meta.frames[index],cloud=new Uint8Array(await bytes(entry.cloud_fraction));
   if(cloud.length!==nz*ny*nx)throw Error('Cloud shape mismatch');
   const data={index,cloud,wind:null,windLoading:null,rain:null,rainLoading:null};frames.set(index,data);return data;
  })();inflight.set(index,promise);try{return await promise;}finally{inflight.delete(index);}
 }
 async function wind(index){
  const data=await load(index);if(data.wind)return data;
  if(!data.windLoading)data.windLoading=(async()=>{data.wind=Float32Array.from(new Uint16Array(await bytes(meta.frames[index].wind)),half);if(data.wind.length!==nz*ny*nx*3)throw Error('Wind shape mismatch');return data;})().catch(error=>{data.windLoading=null;throw error;});
  return data.windLoading;
 }
 async function rain(index){
  const data=await load(index);if(data.rain)return data;
  if(!data.rainLoading)data.rainLoading=(async()=>{data.rain=new Float32Array(await bytes(meta.frames[index+1].phase_increment));if(data.rain.length!==ny*nx*7)throw Error('Precipitation shape mismatch');return data;})().catch(error=>{data.rainLoading=null;throw error;});
  return data.rainLoading;
 }
 function timing(hours){return {weather:snapshotTime(hours,361),precipitation:reportingTime(hours,360)};}
 async function ensure(hours){
  const t=timing(hours),keep=new Set([t.weather.p,t.weather.a,t.weather.b,t.weather.n,t.precipitation.p,t.precipitation.a,t.precipitation.b,t.precipitation.n]);
  await Promise.all([...keep].map(load));await Promise.all([...new Set([t.precipitation.p,t.precipitation.a,t.precipitation.b,t.precipitation.n])].map(rain));
  for(const [index] of frames)if(frames.size>10&&!keep.has(index))frames.delete(index);
  for(const map of [cloudTextures,rainTextures])for(const [index,texture]of map)if(!keep.has(index)){texture.dispose();map.delete(index);}
  return t;
 }
 async function preloadDisplay({onProgress}={}){
  // Only compressed cloud/precipitation display assets. Full50-level transport
  // wind is not replaced or fetched again; F16 winds remain on-demand queries.
  const entries=meta.frames.flatMap(f=>[f.cloud_fraction,...(f.phase_increment?[f.phase_increment]:[])]);let cursor=0,done=0;
  async function worker(){while(cursor<entries.length){await packed(entries[cursor++]);done++;onProgress?.({done,total:entries.length});}}
  await Promise.all([worker(),worker(),worker(),worker()]);return {compressed_assets:compressed.size,scientific_values_changed:false};
 }
 let groundData=null;
 async function ground(){
  if(groundData)return groundData;
  const values=new Float32Array(await bytes(meta.frames[0].surface)),field=meta.surface_fields.indexOf('HGT_m');
  if(field<0||values.length!==ny*nx*meta.surface_fields.length)throw Error('Actual weather ground field unavailable');
  const heights=Float32Array.from({length:ny*nx},(_,i)=>values[i*meta.surface_fields.length+field]);
  const texture=new THREE.DataTexture(heights,nx,ny,THREE.RedFormat,THREE.FloatType);texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.unpackAlignment=1;texture.needsUpdate=true;
  const dx=(meta.longitudes.at(-1)-meta.longitudes[0])/(nx-1),dy=(meta.latitudes.at(-1)-meta.latitudes[0])/(ny-1);
  groundData={texture,values:heights,shape:[ny,nx],bounds_cell_edges_lon_lat:[meta.longitudes[0]-dx/2,meta.latitudes[0]-dy/2,meta.longitudes.at(-1)+dx/2,meta.latitudes.at(-1)+dy/2],
   role:'Actual sampled WRF HGT on weather coordinates, independent of the SO2 output grid.'};return groundData;
 }
 function cloudTexture(index){
  if(!cloudTextures.has(index)){
   const d=frames.get(index);if(!d)throw Error('Weather snapshot not prepared');
   const values=new Float32Array(nz*ny*nx*4);for(let i=0;i<d.cloud.length;i++)values[4*i]=d.cloud[i]/255;
   const t=new THREE.Data3DTexture(values,nx,ny,nz);t.format=THREE.RGBAFormat;t.type=THREE.FloatType;t.minFilter=t.magFilter=THREE.LinearFilter;t.unpackAlignment=1;t.needsUpdate=true;cloudTextures.set(index,t);
  }return cloudTextures.get(index);
 }
 function rainTexture(index){
  if(!meta.liquid_display_binding_qualified)throw Error('Liquid phase requires further native-source binding; no invented rain');
  if(!rainTextures.has(index)){
   const d=frames.get(index);if(!d?.rain)throw Error('Actual precipitation interval not prepared');
   const values=new Float32Array(ny*nx);for(let i=0;i<values.length;i++)values[i]=d.rain[i*7+1];
   const t=new THREE.DataTexture(values,nx,ny,THREE.RedFormat,THREE.FloatType);t.minFilter=t.magFilter=THREE.LinearFilter;t.unpackAlignment=1;t.needsUpdate=true;rainTextures.set(index,t);
  }return rainTextures.get(index);
 }
 function horizontal(lon,lat){const x=axis(meta.longitudes,lon),y=axis(meta.latitudes,lat);return x&&y?{x,y}:null;}
 function spatial(data,x,y,agl){
  if(!Number.isFinite(agl)||agl<0||agl>=meta.height_interface_AGL_m.at(-1))return null;
  const heights=meta.height_centers_AGL_m,z=axis(heights,Math.max(heights[0],Math.min(heights.at(-1),agl)));let cloud=0;const velocity=[0,0,0];
  for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++){
   const index=((k?z.next:z.first)*ny+(j?y.next:y.first))*nx+(i?x.next:x.first),weight=(k?z.weight:1-z.weight)*(j?y.weight:1-y.weight)*(i?x.weight:1-x.weight);
   cloud+=data.cloud[index]/255*weight;for(let c=0;c<3;c++)velocity[c]+=data.wind[index*3+c]*weight;
  }return {cloud,velocity};
 }
 async function sample(lon,lat,agl,hours){
  const h=horizontal(lon,lat);if(!h)return null;const t=snapshotTime(hours,361),samples=await Promise.all([t.p,t.a,t.b,t.n].map(async i=>spatial(await wind(i),h.x,h.y,agl)));if(samples.some(s=>s===null))return null;
  return {wind_east_north_up_m_s:[0,1,2].map(c=>temporalScalar(...samples.map(s=>s.velocity[c]),t.weight)),cloud_fraction:temporalScalar(...samples.map(s=>s.cloud),t.weight),AGL_m:agl,reporting_hour:hours,
   diagnostic_display_interpolation:true,raw_weather_changed:false,maximum_wind_encoding_error_m_s:meta.maximum_wind_F16_error_m_s,maximum_cloud_encoding_error:meta.maximum_cloud_Q8_error,
   vertical_support:'Native model-ground AGL. Diagnostic interpolation below the first mass level holds that level; not a measured surface wind.',weather_integrity_SHA256:meta.source_weather_integrity_receipt_SHA256};
 }
 async function precipitation(lon,lat,hours){
  const h=horizontal(lon,lat);if(!h)return null;const t=reportingTime(hours,360),samples=await Promise.all([t.p,t.a,t.b,t.n].map(async index=>{
   const d=await rain(index),v=Array(7).fill(0);for(let j=0;j<2;j++)for(let i=0;i<2;i++){
    const offset=((j?h.y.next:h.y.first)*nx+(i?h.x.next:h.x.first))*7,weight=(j?h.y.weight:1-h.y.weight)*(i?h.x.weight:1-h.x.weight);for(let c=0;c<7;c++)v[c]+=weight*d.rain[offset+c];
   }return v;
  }));
  return {values_mm:meta.phase_fields.map((_,i)=>temporalScalar(...samples.map(s=>s[i]),t.weight)),fields:meta.phase_fields,reporting_hour:hours,liquid_binding_qualified:meta.liquid_display_binding_qualified,raw_signed_values_retained:true,
   interpretation:'Hourly cumulative-counter differences; convective and shallow phases remain unpartitioned. This display never edits SO2 mass or opacity.'};
 }
 return {meta,timing,ensure,preloadDisplay,ground,cloudTexture,rainTexture,sample,precipitation,get memory(){return {decoded_weather_frames:frames.size,cloud_GPU_textures:cloudTextures.size,rain_GPU_textures:rainTextures.size,compressed_assets:compressed.size};}};
}
