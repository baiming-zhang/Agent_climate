// Keep compressed assets separately from a bounded rolling decoded frame window.
// No rendered images enter the cache or interpolation path.
import {fetchAsset} from './asset_fetch.mjs';
export function scalarFrameCache(frames,{base='',maximumDecoded=8}={}){
 const compressed=new Map(),decoded=new Map();let wanted=new Set();
 async function fetchPacked(index){if(!compressed.has(index))compressed.set(index,fetchAsset(base+frames[index].file).then(async r=>new Uint8Array(await r.arrayBuffer())).catch(e=>{compressed.delete(index);throw e;}));return compressed.get(index);}
 async function prepareOne(index){if(!decoded.has(index))decoded.set(index,(async()=>{const b=await fetchPacked(index);return b[0]===31&&b[1]===139?new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()):b;})().catch(e=>{decoded.delete(index);throw e;}));return decoded.get(index);}
 async function prepare(indices){wanted=new Set(indices);await Promise.all([...wanted].map(prepareOne));if(decoded.size>maximumDecoded)for(const key of decoded.keys())if(!wanted.has(key)&&decoded.size>maximumDecoded)decoded.delete(key);}
 async function preload(){let i=0;await Promise.all(Array.from({length:2},async()=>{while(i<frames.length)await fetchPacked(i++);}));}
 return{prepare,frame:index=>{if(!decoded.has(index))throw Error('Scalar frame not prepared');return decoded.get(index);},preload,get memory(){return{compressed_files:compressed.size,decoded_frames:decoded.size};}};
}
export function regularTime(hours,first,spacing,count){const x=Math.max(0,Math.min(count-1,(hours-first)/spacing)),a=Math.floor(x),b=Math.min(count-1,a+1);return{p:Math.max(0,a-1),a,b,n:Math.min(count-1,b+1),weight:x-a};}
