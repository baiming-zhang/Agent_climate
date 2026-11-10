// Native lon/lat layer means. UI world->lon/lat conversion is injected, not guessed.
export function createMonthQuery(meta,loadGround,loadAggregate,worldToLonLat){
 const [nt,ny,nx,nf]=meta.ground.shape_time_y_x_fields;
 if(nt!==meta.actual_hours||nf!==meta.ground.fields.length)throw Error('Native metadata shape mismatch');
 const fields=new Map(meta.ground.fields.map((name,i)=>[name,i]));
 const cache=new Map();let aggregate;
 function axisCoordinate(axis,value){
  if(!Number.isFinite(value)||value<axis[0]||value>axis.at(-1))return null;
  let lo=0,hi=axis.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(axis[mid]<=value)lo=mid;else hi=mid;}
  return{lo,weight:(value-axis[lo])/(axis[lo+1]-axis[lo])};
 }
 function bilinear(array,offset,stride,channel,x,y){
  let value=0;
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){
   const weight=(i?x.weight:1-x.weight)*(j?y.weight:1-y.weight);
   if(weight)value+=array[offset+((y.lo+j)*nx+x.lo+i)*stride+channel]*weight;
  }
  if(!Number.isFinite(value)||value<0)throw Error('Invalid actual native concentration/deposition');
  return value;
 }
 async function atFrame(index,key,x,y){
  const chunk=meta.ground.chunks.find(c=>index>=c.first_index&&index<c.first_index+c.count);
  if(!chunk||!fields.has(key))throw Error('Native frame/field unavailable');
  if(!cache.has(chunk.file)){
   const pending=Promise.resolve(loadGround(chunk)).then(a=>{
    if(!(a instanceof Float32Array)||a.length!==chunk.count*ny*nx*nf)throw Error('Truncated native ground chunk');return a;
   });cache.set(chunk.file,pending);
  }
  const array=await cache.get(chunk.file);
  // A current query plus24h lookback needs at most3day blocks.
  if(cache.size>4)for(const key of cache.keys()){if(key!==chunk.file){cache.delete(key);break;}}
  return bilinear(array,(index-chunk.first_index)*ny*nx*nf,nf,fields.get(key),x,y);
 }
 return async function query(world,simulationHours){
  if(!Number.isFinite(simulationHours)||simulationHours<0||simulationHours>nt)return null;
  const [lon,lat]=worldToLonLat(world,meta.origin_UTM10N_m);
  const x=axisCoordinate(meta.native_longitudes,lon),y=axisCoordinate(meta.native_latitudes,lat);
  if(!x||!y)return null;
  const centreIndex=Math.max(0,Math.min(nt-1,simulationHours-.5));
  const first=Math.floor(centreIndex),next=Math.min(nt-1,first+1),weight=centreIndex-first;
  const result={lon,lat,simulation_hours:simulationHours,layer_AGL_m:[0,20],forecast:true,not_observation:true,
   concentration_time_policy:'Interpolate native hourly means at interval centers; actual averaging windows retained',
   first_interval:meta.frames[first],next_interval:meta.frames[next],scalar_weight:weight};
  for(const key of ['concentration_ppb','concentration_ug_m3','selected_source_ppb','initial_background_ppb']){
   const a=await atFrame(first,key,x,y),b=next===first?a:await atFrame(next,key,x,y);result[key]=a*(1-weight)+b*weight;
  }
  // Deposition is accumulated at interval END, unlike mean concentration.
  const completed=Math.floor(simulationHours),fraction=simulationHours-completed;
  for(const key of ['drydep_cumulative','wetdep_cumulative']){
   const before=completed===0?0:await atFrame(completed-1,key,x,y);
   const after=completed===nt?before:await atFrame(completed,key,x,y);
   result[key+'_kg_m2']=before*(1-fraction)+after*fraction;
  }
  result.full24h_available=completed>=24;result.mean24h_ppb=null;
  if(result.full24h_available){let sum=0;for(let i=completed-24;i<completed;i++)sum+=await atFrame(i,'concentration_ppb',x,y);result.mean24h_ppb=sum/24;}
  aggregate??=Promise.resolve(loadAggregate(meta.aggregate)).then(a=>{
   if(!(a instanceof Float32Array)||a.length!==ny*nx*meta.aggregate.fields.length)throw Error('Truncated aggregate native field');return a;
  });
  const all=await aggregate;
  for(let i=0;i<meta.aggregate.fields.length;i++)result[meta.aggregate.fields[i]]=bilinear(all,0,meta.aggregate.fields.length,i,x,y);
  result.aggregate_actual_hours=nt;result.quantity_scope=meta.source_scope;
  if(meta.initial_background_evolution_included===false){result.initial_background_ppb=null;result.month_mean_initial_ppb=null;result.initial_background_evolution_included=false;}
  return result;
 };
}
