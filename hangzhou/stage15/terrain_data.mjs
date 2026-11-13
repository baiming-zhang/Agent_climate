import * as THREE from 'three';

// Model-ground interpolation, not a replacement DEM or a geometry-only offset.
export async function loadTerrain(meta,world){
 if(!meta.terrain)return null;
 const m=meta.terrain,r=await fetch('./'+m.file);if(!r.ok)throw Error('Modeled terrain data unavailable');
 let buffer=await r.arrayBuffer();const u=new Uint8Array(buffer);if(u[0]===31&&u[1]===139)buffer=await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 const data=new Float64Array(buffer),[ny,nx]=m.shape,xs=m.longitude_nodes,ys=m.latitude_nodes;
 if(data.length!==nx*ny||xs.length!==nx||ys.length!==ny)throw Error('Actual terrain shape mismatch');
 for(const x of data)if(!Number.isFinite(x))throw Error('Missing model terrain; no flat fill');
 function height(lon,lat){
  if(lon<xs[0]||lon>xs.at(-1)||lat<ys[0]||lat>ys.at(-1))return null;
  const x=(lon-xs[0])/(xs.at(-1)-xs[0])*(nx-1),y=(lat-ys[0])/(ys.at(-1)-ys[0])*(ny-1);
  const i=Math.min(nx-2,Math.floor(x)),j=Math.min(ny-2,Math.floor(y)),a=x-i,b=y-j;
  return (1-a)*(1-b)*data[j*nx+i]+a*(1-b)*data[j*nx+i+1]+(1-a)*b*data[(j+1)*nx+i]+a*b*data[(j+1)*nx+i+1];
 }
 const texture=new THREE.DataTexture(Float32Array.from(data),nx,ny,THREE.RedFormat,THREE.FloatType);texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.unpackAlignment=1;texture.needsUpdate=true;
 // Extra display vertices evaluate the same bilinear surface. Explicit source
 // rows/columns put every unchanged outlet coordinate on an actual mesh vertex.
 const axis=(a,extra)=>Array.from(new Set([...a,...a.slice(1).map((x,i)=>(x+a[i])/2),...extra])).sort((a,b)=>a-b);
 const gx=axis(xs,meta.sources.map(s=>s.lon)),gy=axis(ys,meta.sources.map(s=>s.lat)),vertices=new Float32Array(gx.length*gy.length*3),indices=new Uint32Array((gx.length-1)*(gy.length-1)*6),scale=meta.vertical_display_exaggeration;
 for(let j=0;j<gy.length;j++)for(let i=0;i<gx.length;i++){const[e,n]=world(gx[i],gy[j]),h=height(gx[i],gy[j]);if(h===null)throw Error('Terrain display vertex outside real model domain');const k=(j*gx.length+i)*3;vertices[k]=e;vertices[k+1]=h*.001*scale;vertices[k+2]=-n;}
 let q=0;for(let j=0;j<gy.length-1;j++)for(let i=0;i<gx.length-1;i++){const a=j*gx.length+i,b=a+1,c=a+gx.length,d=c+1;indices.set([a,b,c,b,d,c],q);q+=6;}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({color:'#d1dbce',roughness:1,side:THREE.DoubleSide,flatShading:true});
 let geographicContext=null;
 if(meta.city_context){
  geographicContext=await(await fetch(meta.city_context)).json();const c=geographicContext.landcover,request=await fetch(c.file);if(!request.ok)throw Error('Real land-cover context unavailable');
  const data=await new Response(request.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),[cy,cx]=c.shape;if(data.byteLength!==cy*cx*4)throw Error('Land-cover context shape mismatch');
  const map=new THREE.DataTexture(new Uint8Array(data),cx,cy,THREE.RGBAFormat);map.colorSpace=THREE.SRGBColorSpace;map.minFilter=map.magFilter=THREE.NearestFilter;map.needsUpdate=true;
  const uv=new Float32Array(gx.length*gy.length*2);for(let j=0;j<gy.length;j++)for(let i=0;i<gx.length;i++){const k=(j*gx.length+i)*2;uv[k]=(gx[i]-c.bbox[0])/(c.bbox[2]-c.bbox[0]);uv[k+1]=(gy[j]-c.bbox[1])/(c.bbox[3]-c.bbox[1]);}geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));material.color.set('#ffffff');material.map=map;
  material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
   if(all(greaterThanEqual(vMapUv,vec2(0.)))&&all(lessThanEqual(vMapUv,vec2(1.))))diffuseColor*=texture2D(map,vMapUv);
   else diffuseColor.rgb*=vec3(.60,.72,.60);
   #endif`);};
 }
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Unchanged bilinear model terrain';
 const sourceChecks=meta.sources.map(s=>{const h=height(s.lon,s.lat);if(Math.abs(h-s.ground_orthometric_m)>1e-8)throw Error('Source/model terrain mismatch');const i=gx.indexOf(s.lon),j=gy.indexOf(s.lat),meshHeight=vertices[(j*gx.length+i)*3+1]/scale*1000;if(Math.abs(meshHeight-h)>1e-4)throw Error('Outlet terrain-mesh vertex is displaced');return{id:s.id,ground_orthometric_m:h,model_ground_orthometric_m:s.ground_orthometric_m,mesh_ground_orthometric_m:meshHeight,error_m:meshHeight-h};});
 const min=world(xs[0],ys[0]),max=world(xs.at(-1),ys.at(-1));
 return{height,texture,mesh,min,max,sourceChecks,shape:[ny,nx],graphics_vertex_shape:[gy.length,gx.length],geographicContext,physical_model_terrain_modified:false};
}
