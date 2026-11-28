import * as THREE from 'three';
import {nativeQueryV8} from './native_query_v8.mjs';
import {reportingTime,decodeDisplayFrame,concentrationComponent,displayAxis} from './display_scalar_v8.mjs';
import {temporalScalar} from './temporal_scalar.mjs';

// New15-layer/four-component interface. Never reads old8-channel query assets.
export async function loadFinal360FieldData(meta,{maximumBlockBytes=192*1024*1024}={}){
  const native=await nativeQueryV8(meta.native_manifest_url),response=await fetch(meta.display_manifest_url);
  if(!response.ok)throw Error(`Display manifest: HTTP ${response.status}`);
  const display=await response.json(),base=new URL('.',new URL(meta.display_manifest_url,location.href));
  if(display.schema!=='hangzhou-v8-display-scalar-rgba-v1'||display.source_sha256!==native.meta.source_sha256||display.source_sha256!==meta.source_sha256)throw Error('Display and native science sources differ');
  const [nt,nz,ny,nx,nc]=display.shape;
  if(nt!==360||nz!==15||nc!==4||native.meta.shape.join(',')!==[nt,nz,ny,nx].join(','))throw Error('Incompatible final360 grid');
  const blocks=new Map(),decoded=new Map(),inflight=new Map();let blockBytes=0;
  const time=h=>reportingTime(h,nt),g=native.geometry;
  async function block(chunk){
    if(blocks.has(chunk.file)){const a=blocks.get(chunk.file);blocks.delete(chunk.file);blocks.set(chunk.file,a);return a;}
    if(inflight.has(chunk.file))return inflight.get(chunk.file);
    const pending=(async()=>{
      const r=await fetch(new URL(chunk.file,base));if(!r.ok)throw Error(`Display chunk: HTTP ${r.status}`);
      const compressed=await r.arrayBuffer();
      const raw=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      if(raw.byteLength!==chunk.raw_bytes)throw Error('Display chunk length mismatch');
      const values=new Uint8Array(raw);blocks.set(chunk.file,values);blockBytes+=values.byteLength;
      while(blockBytes>maximumBlockBytes&&blocks.size>1){const key=blocks.keys().next().value;blockBytes-=blocks.get(key).byteLength;blocks.delete(key);}
      return values;
    })();
    inflight.set(chunk.file,pending);
    try{return await pending;}finally{inflight.delete(chunk.file);}
  }
  async function ensure(h){
    const t=time(h),indices=[...new Set([t.p,t.a,t.b,t.n])];
    await Promise.all(indices.map(async i=>{
      if(decoded.has(i))return;
      const chunk=display.chunks.find(c=>i>=c.first_index&&i<c.first_index+c.count);
      if(!chunk)throw Error('Missing actual scalar frame');
      decoded.set(i,decodeDisplayFrame(display,await block(chunk),chunk,i));
    }));
    for(const key of decoded.keys())if(!indices.includes(key))decoded.delete(key);
  }
  function texture(index){
    const values=decoded.get(index);if(!values)throw Error('Scalar frame is not prepared');
    const tex=new THREE.Data3DTexture(values,nx,ny,nz);
    tex.format=THREE.RGBAFormat;tex.type=THREE.FloatType;tex.minFilter=tex.magFilter=THREE.LinearFilter;
    tex.unpackAlignment=1;tex.needsUpdate=true;return tex;
  }
  function displayAt(lon,lat,agl,h,selection='total'){
    const x=displayAxis(g.lon,g.lon_interface,lon),y=displayAxis(g.lat,g.lat_interface,lat),z=displayAxis(g.height,g.height_interface,agl);
    if(!x||!y||!z)return 0;
    const t=time(h);
    function one(index){
      const data=decoded.get(index);if(!data)return null;let sum=0;
      for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++){
        const offset=(((k?z.next:z.first)*ny+(j?y.next:y.first))*nx+(i?x.next:x.first))*4;
        sum+=concentrationComponent(data,offset,selection)*(i?x.weight:1-x.weight)*(j?y.weight:1-y.weight)*(k?z.weight:1-z.weight);
      }
      return sum;
    }
    const values=[t.p,t.a,t.b,t.n].map(one);
    return values.some(v=>v===null)?null:temporalScalar(...values,t.weight);
  }
  async function sample(lon,lat,agl,h=0,fixedSurface=false,field='total'){
    if(!Number.isFinite(h)||h<0||h>nt)return null;
    const q=await native.query({lon,lat,agl_m:fixedSurface?0:agl,report_hour:Math.min(nt-Number.EPSILON*nt,h),field});
    if(!q)return null;
    return {...q,value:q.ug_m3,unit:'µg/m³',original_value_ng_m3:q.value,
      hour:q.report_interval_h?.[1],period_hours:q.report_interval_h,layer:q.height_interval_m_AGL,
      type:'Original native cell/hour mean; no display quantization or coordinate interpolation.'};
  }
  async function preload(){
    // Cache eviction is a performance choice, never a resource-triggered abort.
    let cursor=0;
    async function worker(){while(cursor<display.chunks.length)await block(display.chunks[cursor++]);}
    await Promise.all([worker(),worker(),worker()]);
  }
  await ensure(0);
  return {meta:display,native,geometry:g,time,ensure,texture,displayAt,sample,preload,
    get memory(){return {display_block_bytes:blockBytes,decoded_frames:decoded.size,inflight_blocks:inflight.size};}};
}
