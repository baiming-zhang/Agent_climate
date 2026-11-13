// Bounded retries for temporary hosting errors. Never substitute data or hide 404s.
export async function fetchAsset(url){
 let last;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const r=await fetch(url);
   if(r.ok)return r;
   const retryable=[429,500,502,503,504].includes(r.status);
   if(!retryable||attempt===2)throw Object.assign(Error(`Asset unavailable ${r.status}: ${url}`),{permanent:true});
   last=Error(`Temporary asset response ${r.status}: ${url}`);
  }catch(e){if(e.permanent||attempt===2)throw e;last=e;}
  await new Promise(resolve=>setTimeout(resolve,[500,1500][attempt]));
 }
 throw last;
}
