// Two physical scalars, decoded BEFORE spatial/time interpolation. No RGB frames.
const scratch=new DataView(new ArrayBuffer(4));
export function halfBits(value){
 if(!Number.isFinite(value)||value<0||value>65504)throw Error('DisplayHalfFloat range exceeded; do not clip science');
 scratch.setFloat32(0,value,true);const bits=scratch.getUint32(0,true),exp=(bits>>>23)&255,mant=bits&0x7fffff;
 if(exp<102)return 0;
 const round=(integer,remainder,half)=>integer+(remainder>half||(remainder===half&&(integer&1))?1:0);
 if(exp<113){const shift=126-exp,n=mant|0x800000,integer=n>>>shift,remainder=n- integer*2**shift;return round(integer,remainder,2**(shift-1));}
 let exponent=exp-112;let integer=mant>>>13;integer=round(integer,mant&8191,4096);
 if(integer===1024){integer=0;exponent++;}return(exponent<<10)|integer;
}
export function makeScalarLookup(quantizer){
 const values=new Float32Array(256),half=new Uint16Array(256);
 for(let q=0;q<256;q++){values[q]=quantizer.scale_ppb*Math.expm1(q/255*quantizer.log_max);half[q]=halfBits(values[q]);}
 return{values,half};
}
export function prepareDisplayFrame(meta,packedChunk,chunk,globalIndex,lookups){
 const [nt,nz,ny,nx,nf]=meta.display.shape_time_z_y_x_fields;
 if(nf!==2||!(packedChunk instanceof Uint8Array)||packedChunk.length!==chunk.count*nz*ny*nx*2)throw Error('Truncated Q8 display block');
 const local=globalIndex-chunk.first_index;
 if(local<0||local>=chunk.count||globalIndex<0||globalIndex>=nt)throw Error('Display frame outside actual time');
 const count=nz*ny*nx,offset=local*count*2,out=new Uint16Array(count*2);
 const source=lookups.source_ppb.half,initial=lookups.initial_ppb.half;
 for(let i=0;i<count;i++){out[i*2]=source[packedChunk[offset+i*2]];out[i*2+1]=initial[packedChunk[offset+i*2+1]];}
 return out;
 // THREE.Data3DTexture(out,nx,ny,nz), format=RGFormat,type=HalfFloatType,
 // min/magFilter=LinearFilter, unpackAlignment=1. Active textures only, Q8CPU cache.
}
