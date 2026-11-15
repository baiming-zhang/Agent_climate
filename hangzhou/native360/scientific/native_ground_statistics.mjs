// Read saved native ground statistics; no resimulation, opacity query or clipping.
export function createGroundStatistics(meta,base){
 const [ny,nx,nf]=meta.ground.shape,cache=new Map();
 if(nf!==8||meta.actual_hours!==360||meta.engineering_only)throw Error('Requires the actual complete native360h fields');
 function axis(a,x){if(x<a[0]||x>a.at(-1))return null;let l=0,r=a.length-1;while(r-l>1){const i=(l+r)>>1;if(a[i]>x)r=i;else l=i;}return[l,(x-a[l])/(a[l+1]-a[l])];}
 async function load(folder,rec){const key=folder+rec.file;if(!cache.has(key))cache.set(key,(async()=>{const response=await fetch(base+folder+rec.file);if(!response.ok)throw Error('Native statistic unavailable: '+response.status);const b=new Uint8Array(await response.arrayBuffer());const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');if(hash!==rec.SHA256)throw Error('Saved statistic SHA mismatch');const raw=b[0]===31&&b[1]===139?await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():b.buffer;const a=new Float32Array(raw);if(a.length!==nx*ny*nf)throw Error('Native ground statistic shape mismatch');return a;})().catch(e=>{cache.delete(key);throw e;}));const a=await cache.get(key);if(cache.size>3)for(const k of cache.keys())if(k!==key&&cache.size>3)cache.delete(k);return a;}
 async function sample(lon,lat,period='whole',number=1){
  const ax=axis(meta.native_longitudes,lon),ay=axis(meta.native_latitudes,lat);if(!ax||!ay)return null;
  let rec,folder,fields,range,meaning;
  if(period==='whole'){rec=meta.statistics.whole_period;folder='statistics/';fields=meta.statistics.fields;range=[0,360];meaning='360-hour mean concentration; final360-hour cumulative deposition';}
  else if(period==='day'){if(!Number.isInteger(number)||number<1||number>15)return null;rec=meta.statistics.daily_summaries[number-1];if(!rec.complete24h||rec.count!==24)return null;folder='statistics/';fields=meta.statistics.daily_fields;range=[rec.first_index,rec.first_index+24];meaning='24-hour mean concentration; deposition increment over the same actual24-hour interval';}
  else if(period==='hour'){if(!Number.isInteger(number)||number<1||number>360)return null;rec=meta.ground.frames[number-1];folder='ground/';fields=meta.ground.fields;range=[number-1,number];meaning='Hourly mean concentration; deposition cumulative from source initialization through the end of this hour';}
  else throw Error('Unknown statistic period');
  const a=await load(folder,rec),v=new Float64Array(nf);
  for(let y=0;y<2;y++)for(let x=0;x<2;x++){const index=((ay[0]+y)*nx+ax[0]+x)*nf,w=(x?ax[1]:1-ax[1])*(y?ay[1]:1-ay[1]);for(let f=0;f<nf;f++)v[f]+=a[index+f]*w;}
  if(!Array.from(v).every(Number.isFinite))throw Error('Nonfinite saved statistic; no replacement applied');
  const utc=h=>new Date(Date.parse(meta.source_start_UTC)+h*3600000).toISOString();
  return{longitude:lon,latitude:lat,layer_AGL_m:[0,20],period_hours:range,period_UTC:range.map(utc),meaning,fields:Object.fromEntries(fields.map((f,i)=>[f,v[i]])),source_freeze_SHA256:meta.source_freeze_SHA256,source_file:folder+rec.file,source_file_SHA256:rec.SHA256,encoding:'Unit-converted native F32 statistics, bilinear horizontal coordinates; not display quantization.',background:'Excluded; source increments only',no_new_model_steps:true};
 }
 return{sample};
}
