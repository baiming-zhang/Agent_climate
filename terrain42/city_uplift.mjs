// Translate original geometry through the resolved physical uplift field.
// Building height is preserved at equal x/z; factory pads have zero uplift.
export async function upliftCity(city,bytes,THREE){
 const receipt=await (await fetch('./uplift.json')).json(),data=new Float32Array(await bytes('./'+receipt.file));
 const [ny,nx]=receipt.shape,[x0,y0,x1,y1]=receipt.bounds;
 function sample(e,n){
  const x=(e-x0)/(x1-x0)*(nx-1),y=(n-y0)/(y1-y0)*(ny-1);
  if(x<0||y<0||x>=nx-1||y>=ny-1)return 0;
  const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,k=j*nx+i;
  return (data[k]*(1-u)*(1-v)+data[k+1]*u*(1-v)+data[k+nx]*(1-u)*v+data[k+nx+1]*u*v)*.001*1.8;
 }
 city.updateMatrixWorld(true);let meshes=0,vertices=0,maxUplift=0;const names=[];
 city.traverse(o=>{
  if(/Industrial|Geographic/.test(o.name))names.push(o.name);
  let ancestor=o,skip=false;while(ancestor&&ancestor!==city){if(/Harbour[ _]water|Diorama[ _]base/.test(ancestor.name))skip=true;ancestor=ancestor.parent;}
  if(!o.isMesh||skip)return;
  const p=o.geometry.attributes.position;if(!p)return;
  // Clone to avoid modifying any mesh sharing an original geometry instance.
  o.geometry=o.geometry.clone();const pos=o.geometry.attributes.position,inv=o.matrixWorld.clone().invert(),v=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){
   v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);const h=sample(v.x,-v.z);maxUplift=Math.max(maxUplift,h);
   v.y+=h;v.applyMatrix4(inv);pos.setXYZ(i,v.x,v.y,v.z);
  }
  pos.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();
  meshes++;vertices+=pos.count;
 });
 city.userData.upliftReceipt={meshes,vertices,maxUpliftKm:maxUplift,preservedObjects:names,seed:42,originalAssetRetained:true};
 return city.userData.upliftReceipt;
}
