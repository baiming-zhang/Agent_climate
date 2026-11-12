import {VERTICAL_SCALE,AGL_SCALE} from './display_geometry.mjs?v=mountain1km-r06';
// Reuse the original factory geometry with the same display-only height mapping.
// The one emitting outlet and its base are supplied by actual new concentration metadata.
export function placeMountainPlant(city,source,THREE){
 const template=city.getObjectByName('Industrial_NPRI_2776')||city.getObjectByName('Industrial NPRI_2776');
 if(!template)throw Error('Original factory geometry is required');
 const factory=template.clone(true);factory.name='Hypothetical_mountain_factory_single_source';factory.scale.y*=AGL_SCALE/1.8;city.add(factory);
 const original=[-3.0655980438645347,1.2745481565371155],p=source.world_east_north_km;
 factory.position.x+=p[0]-original[0];factory.position.z-=p[1]-original[1];
 city.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(factory);factory.position.y+=source.base-box.min.y;
 city.traverse(o=>{if(/^Industrial[ _]NPRI/.test(o.name))o.visible=false;});
 city.updateMatrixWorld(true);factory.userData.hypothetical=true;factory.userData.activeSourceCount=1;
 return factory;
}
export function cropMountainScene(scene,meta,THREE,renderer){
 const [x0,y0,x1,y1]=meta.display.bounds_east_north_km;
 const planes=[new THREE.Plane(new THREE.Vector3(1,0,0),-x0),new THREE.Plane(new THREE.Vector3(-1,0,0),x1),
  new THREE.Plane(new THREE.Vector3(0,0,1),y1),new THREE.Plane(new THREE.Vector3(0,0,-1),-y0)];
 renderer.localClippingEnabled=true;
 scene.traverse(o=>{if(o.material)for(const m of (Array.isArray(o.material)?o.material:[o.material])){m.clippingPlanes=planes;m.needsUpdate=true;}});
 scene.userData.singleMountainCase={activeSources:1,displayCrop:meta.display.bounds_east_north_km,otherEmissions:false};
}
