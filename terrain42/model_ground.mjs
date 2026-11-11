import {VERTICAL_SCALE} from './display_geometry.mjs?v=mountain-relief-r05';
// One visible mountain surface from the actual native/FLEX display-height grid.
// Geometry is bilinearly subdivided, without adding high-frequency terrain or
// changing any concentration, deposition, weather or native query value.
export function makeModelTerrain(scene,meta,terrain,THREE){
 const [,nz,ny,nx]=meta.display.shape_time_z_y_x_fields,[x0,y0,x1,y1]=meta.display.bounds_east_north_km;
 const ground=(e,n)=>{const u=Math.max(0,Math.min(nx-1,(e-x0)/(x1-x0)*(nx-1))),v=Math.max(0,Math.min(ny-1,(n-y0)/(y1-y0)*(ny-1))),i=Math.min(nx-2,Math.floor(u)),j=Math.min(ny-2,Math.floor(v)),a=u-i,b=v-j;
  return terrain[j*nx+i]*(1-a)*(1-b)+terrain[j*nx+i+1]*a*(1-b)+terrain[(j+1)*nx+i]*(1-a)*b+terrain[(j+1)*nx+i+1]*a*b;};
 const sx=(nx-1)*16+1,sy=(ny-1)*16+1,pos=new Float32Array(sx*sy*3),col=new Float32Array(pos.length),indices=[];
 const low=new THREE.Color('#becaa4'),high=new THREE.Color('#678263'),rock=new THREE.Color('#aab1a7'),water=new THREE.Color('#76adba');
 for(let y=0;y<sy;y++)for(let x=0;x<sx;x++){
  const e=x0+(x1-x0)*x/(sx-1),n=y0+(y1-y0)*y/(sy-1),h=ground(e,n),k=(y*sx+x)*3;
  pos.set([e,h*.001*VERTICAL_SCALE,-n],k);const c=h<.5?water:low.clone().lerp(high,Math.min(1,h/1800)).lerp(rock,Math.max(0,Math.min(1,(h-2000)/2200)));col.set([c.r,c.g,c.b],k);
 }
 for(let y=0;y<sy-1;y++)for(let x=0;x<sx-1;x++){const a=y*sx+x,b=a+1,c=a+sx,d=c+1;indices.push(a,c,b,b,c,d);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setIndex(indices);g.computeVertexNormals();
 const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));mesh.name='Actual terrain display, native model-ground';
 mesh.userData.nativeGroundSampler=ground;mesh.userData.nativeGroundShape=[ny,nx];mesh.userData.displayVerticalScale=VERTICAL_SCALE;mesh.userData.displayMeshShape=[sy,sx];scene.add(mesh);return mesh;
}

export function groundCityAndPlant(city,factory,source,modelTerrain,THREE){
 const ground=modelTerrain.userData.nativeGroundSampler,groups=[];
 city.traverse(o=>{
  if(/Real.*elevation.*vector.*coastline|Harbour[ _]water|Diorama[ _]base/i.test(o.name))o.visible=false;
  if(/^Geographic[ _]footprints[ _]\d+$/i.test(o.name))groups.push(o);
 });
 city.updateMatrixWorld(true);let moved=0,unresolved=0;const v=new THREE.Vector3();
 for(const group of groups){
  const meshes=[];group.traverse(o=>{if(o.isMesh&&o.geometry.attributes.position)meshes.push(o);});
  const columns=new Map(),key=(x,z)=>Math.round(x*500)+','+Math.round(z*500);
  for(const o of meshes){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){
   v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);const k=key(v.x,v.z),c=columns.get(k);
   if(c){c[0]=Math.min(c[0],v.y);c[1]=Math.max(c[1],v.y);}else columns.set(k,[v.y,v.y]);
  }}
  function floorAt(x,z){let c=columns.get(key(x,z));if(c&&c[1]-c[0]>.002)return c[0];
   const a=Math.round(x*500),b=Math.round(z*500);for(let r=1;r<=5;r++){let best=Infinity;for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){
    const t=columns.get((a+i)+','+(b+j));if(t&&t[1]-t[0]>.002)best=Math.min(best,t[0]);
   }if(Number.isFinite(best))return best;}return c?.[0];}
  for(const o of meshes){o.geometry=o.geometry.clone();const p=o.geometry.attributes.position,inv=o.matrixWorld.clone().invert();
   for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);const floor=floorAt(v.x,v.z);
    if(floor===undefined){unresolved++;continue;}v.y=ground(v.x,-v.z)*.001*VERTICAL_SCALE+(v.y-floor)*VERTICAL_SCALE/1.8;v.applyMatrix4(inv);p.setXYZ(i,v.x,v.y,v.z);moved++;
   }p.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();
  }
 }
 // A schematic level plant pad is subgrid display geometry, anchored exactly
 // at the emitting outlet's native model-ground. It does not feed back into
 // atmospheric terrain or change the ground texture used by concentration.
 city.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(factory),e=source.world_east_north_km[0],n=source.world_east_north_km[1],base=source.base;
 const inner=Math.max(Math.abs(b.min.x-e),Math.abs(b.max.x-e),Math.abs(b.min.z+n),Math.abs(b.max.z+n))+.025,outer=inner+.10;
 const p=modelTerrain.geometry.attributes.position;
 for(let i=0;i<p.count;i++){const d=Math.max(Math.abs(p.getX(i)-e),Math.abs(p.getZ(i)+n));if(d>=outer)continue;
  let t=Math.max(0,Math.min(1,(d-inner)/(outer-inner)));t=t*t*(3-2*t);p.setY(i,base*(1-t)+p.getY(i)*t);
 }
 p.needsUpdate=true;modelTerrain.geometry.computeVertexNormals();modelTerrain.geometry.computeBoundingBox();modelTerrain.geometry.computeBoundingSphere();
 const receipt={single_visible_native_surface:true,legacy_detailed_surface_hidden:true,building_groups:groups.length,building_vertices_redraped:moved,unresolved_columns:unresolved,
  plant_pad_display_only:true,source_base_display_km:base,pad_inner_halfwidth_km:inner,concentrations_and_native_ground_queries_unchanged:true};
 modelTerrain.userData.alignmentReceipt=receipt;return receipt;
}
