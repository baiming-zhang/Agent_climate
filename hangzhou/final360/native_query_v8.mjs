// Exact native hourly values. Display interpolation belongs in the renderer.
const schema='hangzhou-v8-native-hourly-f64-v1';
export async function nativeQueryV8(manifestURL,{maximumDecoded=6}={}){
  const response=await fetch(manifestURL);if(!response.ok)throw Error(`Native manifest: HTTP ${response.status}`);
  const meta=await response.json();if(meta.schema!==schema)throw Error('Incompatible native field schema');
  const base=new URL('.',new URL(manifestURL,location.href)),cache=new Map(),baselineCache=new Map();
  async function unpack(entry){
    const r=await fetch(new URL(entry.file,base));if(!r.ok)throw Error(`Native field: HTTP ${r.status}`);
    const packed=await r.arrayBuffer();
    const raw=await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    if(raw.byteLength!==entry.raw_bytes)throw Error('Native field length mismatch');
    const count=entry.shape.reduce((a,b)=>a*b,1);if(count*8!==raw.byteLength)throw Error('Native field shape mismatch');
    const little=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
    return little?new Float64Array(raw):Float64Array.from({length:count},(_,i)=>new DataView(raw).getFloat64(i*8,true));
  }
  const geometry={};await Promise.all(Object.entries(meta.geometry).map(async([key,value])=>{geometry[key]=await unpack(value);}));
  const xEdges=geometry.lon_interface,yEdges=geometry.lat_interface,zEdges=geometry.height_interface;
  if(!xEdges||!yEdges)throw Error('Actual native cell boundaries are missing');
  function bin(edges,value){
    if(!Number.isFinite(value)||value<edges[0]||value>=edges[edges.length-1])return -1;
    let lo=0,hi=edges.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(value<edges[mid])hi=mid;else lo=mid;}return lo;
  }
  async function frame(field,hour){
    const description=meta.fields[field];if(!description)throw Error(`Unknown native field: ${field}`);
    if(!Number.isInteger(hour)||hour<0||hour>=360)throw Error('Reporting hour outside [0,360)');
    const key=field+':'+hour;
    if(!cache.has(key)){
      cache.set(key,unpack(description.frames[hour]).catch(e=>{cache.delete(key);throw e;}));
      while(cache.size>maximumDecoded)cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
  }
  async function query({lon,lat,agl_m=0,report_hour,field='total'}){
    const x=bin(xEdges,lon),y=bin(yEdges,lat),z=bin(zEdges,agl_m);
    if(x<0||y<0||z<0||!Number.isFinite(report_hour)||report_hour<0||report_hour>=360)return null;
    const h=Math.floor(report_hour),description=meta.fields[field];if(!description)throw Error('Unknown native field');
    const values=await frame(field,h),nx=meta.shape[3],ny=meta.shape[2];
    const is3D=description.dimensions.includes('height'),index=is3D?(z*ny+y)*nx+x:y*nx+x;
    const value=values[index];if(!Number.isFinite(value))throw Error('Invalid native value');
    return {value,units:description.units,ug_m3:description.units==='ng m-3'?value/1000:null,
      report_interval_h:description.temporal_kind==='cumulative_endpoint'?null:[h,h+1],
      native_snapshot_report_hour:description.temporal_kind==='cumulative_endpoint'?h+1:null,
      native_hourly_mean:description.temporal_kind==='hourly_mean',
      height_interval_m_AGL:is3D?[zEdges[z],zEdges[z+1]]:field==='ground_layer_0_25m'?[0,25]:null,
      native_cell:{x,y,z:is3D?z:null,lon:geometry.lon[x],lat:geometry.lat[y]},
      terrain_m_MSL:geometry.terrain[y*nx+x],source_sha256:meta.source_sha256};
  }
  async function depositionInterval({lon,lat,start_report_hour=0,end_report_hour=360,field='dry_stack'}){
    if(!Number.isInteger(start_report_hour)||!Number.isInteger(end_report_hour)||start_report_hour<0||end_report_hour>360||end_report_hour<start_report_hour)throw Error('Deposition interval needs saved integer-hour endpoints');
    if(meta.fields[field]?.temporal_kind!=='cumulative_endpoint'||meta.fields[field].units!=='ng m-2')throw Error('Physical deposition units or time semantics unavailable');
    const x=bin(xEdges,lon),y=bin(yEdges,lat);if(x<0||y<0)return null;
    async function snapshot(hour){
      if(hour>0)return frame(field,hour-1);
      const entry=meta.deposition_baseline?.fields[field];if(!entry)throw Error('Actual report-start deposition baseline missing');
      if(!baselineCache.has(field))baselineCache.set(field,unpack(entry).catch(e=>{baselineCache.delete(field);throw e;}));
      return baselineCache.get(field);
    }
    const[a,b]=await Promise.all([snapshot(start_report_hour),snapshot(end_report_hour)]),index=y*meta.shape[3]+x;
    const amount=b[index]-a[index],seconds=(end_report_hour-start_report_hour)*3600;
    if(!Number.isFinite(amount))throw Error('Invalid deposition interval');
    return {amount_ng_m2:amount,amount_kg_m2:amount/1e12,mean_flux_kg_m2_s:seconds?amount/1e12/seconds:null,
      report_interval_h:[start_report_hour,end_report_hour],native_cell:{x,y},source_sha256:meta.source_sha256,
      method:'Difference of original cumulative endpoints; actual lead10 baseline at report0. No clipping or repeated accumulation.'};
  }
  return {meta,geometry,frame,query,depositionInterval,get decodedCacheSize(){return cache.size;}};
}
