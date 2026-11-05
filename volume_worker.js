// Decode numerical scalar data away from the UI/render thread.
self.onmessage=async({data})=>{
  try{
    const response=await fetch(data.url);if(!response.ok)throw Error(`${response.status} ${data.url}`);
    const bytes=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const encoded=new Uint16Array(bytes),values=new Float32Array(encoded.length),factor=Math.log1p(data.cap)/65535;
    for(let i=0;i<encoded.length;i++)values[i]=Math.expm1(encoded[i]*factor);
    self.postMessage({id:data.id,values:values.buffer},[values.buffer]);
  }catch(error){self.postMessage({id:data.id,error:error.message});}
};
