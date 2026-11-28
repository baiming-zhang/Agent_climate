// Decode scientific-display coordinate words; never a rendered image codec.
export function decodePlumeGeometryWords(raw,entry,meta){
  if(meta.schema!=='hangzhou-v8-plume-coordinate-words-v1'||meta.word_stride!==9)throw Error('Wrong plume geometry word schema');
  const bytes=raw instanceof Uint8Array?raw:new Uint8Array(raw),n=entry.records;
  if(bytes.byteLength!==n*9*4)throw Error('Actual plume geometry size mismatch');
  const values=new Float32Array(n*9),bits=new Uint32Array(1),scalar=new Float32Array(bits.buffer),state=new Int32Array(9);
  for(let i=0;i<n;i++){
    for(let c=0;c<9;c++){
      const word=(bytes[c*n+i]|bytes[(9+c)*n+i]<<8|bytes[(18+c)*n+i]<<16|bytes[(27+c)*n+i]<<24);
      state[c]=c===0?word:(state[c]+word)|0;
    }
    const escaped=state[0]<0,offset=i*9;
    values[offset]=escaped?-state[0]-1:state[0];
    for(let c=1;c<9;c++){
      if(escaped||c===8){bits[0]=state[c]>>>0;values[offset+c]=scalar[0];}
      else values[offset+c]=state[c]*meta.coordinate_quantum_m;
    }
  }
  return values;
}
