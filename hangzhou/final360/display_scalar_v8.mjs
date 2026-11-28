// Presentation scalar decoding only; scientific queries use native_query_v8.mjs.
export const components=['regional_stack','regional_distributed','near_plume','pending_sync'];

export function reportingTime(hours,count=360){
  if(!Number.isFinite(hours)||hours<0||hours>count)throw Error('Display time outside the reporting period');
  const position=Math.max(0,Math.min(count-1,hours-.5)),a=Math.floor(position),b=Math.min(count-1,a+1);
  return {p:Math.max(0,a-1),a,b,n:Math.min(count-1,b+1),weight:position-a};
}

export function decodeDisplayFrame(meta,block,chunk,index){
  if(meta.schema!=='hangzhou-v8-display-scalar-rgba-v1'||meta.components.join('|')!==components.join('|'))throw Error('Wrong display component schema');
  const [nt,nz,ny,nx,nc]=meta.shape;
  if(nc!==4||!Number.isInteger(index)||index<chunk.first_index||index>=chunk.first_index+chunk.count||index>=nt)throw Error('Invalid scalar frame index');
  const stride=nz*ny*nx*nc,start=(index-chunk.first_index)*stride;
  if(block.length!==stride*chunk.count||meta.code_lookup_ug_m3.length!==256)throw Error('Scalar chunk shape mismatch');
  const decoded=new Float32Array(stride),lut=meta.code_lookup_ug_m3;
  for(let i=0;i<stride;i++)decoded[i]=lut[block[start+i]];
  return decoded;
}

export function concentrationComponent(values,offset,selection='total'){
  const stack=values[offset],distributed=values[offset+1],near=values[offset+2],pending=values[offset+3];
  switch(selection){
    case 'total':return stack+distributed+near+pending;
    case 'documented_stack':return stack+near+pending;
    case 'distributed':return distributed;
    case 'regional_stack':return stack;
    case 'near_plume':return near;
    case 'pending_sync':return pending;
    default:throw Error('Unknown concentration contribution');
  }
}

// Native values at clicks remain original cell/hour means. This helper is for
// continuous display coordinates only, without inventing an exterior edge cell.
export function displayAxis(centers,edges,value){
  if(!Number.isFinite(value)||value<edges[0]||value>=edges.at(-1))return null;
  if(value<=centers[0])return {first:0,next:0,weight:0};
  if(value>=centers.at(-1))return {first:centers.length-1,next:centers.length-1,weight:0};
  let lo=0,hi=centers.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(value<centers[mid])hi=mid;else lo=mid;}
  return {first:lo,next:hi,weight:(value-centers[lo])/(centers[hi]-centers[lo])};
}
