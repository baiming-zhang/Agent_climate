// Display-only landmark colours; clone materials so nearby buildings retain theirs.
// Stylized daytime palette, not surveyed facade colours or temporary event wraps.
const palette=[
 {key:'canada-place',match:/^(Canada Place pier|Exhibition hall|Sail mast|Tensile sail)/,
  style:name=>/^Exhibition hall/.test(name)?['#426c88',.34,.15]:/^Canada Place pier/.test(name)?['#b2a292',.82,.02]:/^Sail mast/.test(name)?['#aab9bf',.38,.45]:['#f4f5ee',.72,.02]},
 {key:'harbour-centre',match:/^(Harbour Centre office podium|Lookout shaft|Lookout tapered bowl|Lookout deck|Lookout white roof)/,
  style:name=>/^Harbour Centre/.test(name)?['#bba88b',.80,.04]:/^Lookout shaft/.test(name)?['#c5c5bc',.72,.04]:/^Lookout white roof/.test(name)?['#b7c4cb',.38,.50]:/^Lookout deck/.test(name)?['#284c66',.28,.22]:['#657f92',.35,.30]},
 {key:'science-world',match:/^(Science World base|Science World geodesic dome|Geodesic structure)/,
  style:name=>/^Science World base/.test(name)?['#b47e59',.72,.12]:/^Geodesic structure/.test(name)?['#d4dfe2',.32,.68]:['#7395ad',.30,.54]},
 {key:'lions-gate',match:/^(Bridge deck edge|Suspension tower|Tower cross brace|Suspension main cable|Vertical suspender)/,
  style:name=>/^Bridge deck/.test(name)?['#4c6665',.78,.08]:/^Suspension main cable|^Vertical suspender/.test(name)?['#28564b',.62,.25]:['#357b68',.56,.24]}
];

export function colourLandmarks(root){
 const changed=[],groups={};
 root.traverse(object=>{
  if(!object.isMesh||object.userData.landmarkPalette)return;
  const name=object.userData.name||object.name.replaceAll('_',' '),rule=palette.find(p=>p.match.test(name));
  if(!rule)return;
  const [colour,roughness,metalness]=rule.style(name);
  const tint=original=>{const material=original.clone();material.name=`${rule.key} / ${colour}`;material.color.set(colour);material.roughness=roughness;material.metalness=metalness;return material;};
  object.material=Array.isArray(object.material)?object.material.map(tint):tint(object.material);
  object.userData.landmarkPalette=rule.key;groups[rule.key]=(groups[rule.key]||0)+1;
  changed.push({name,group:rule.key,colour,roughness,metalness});
 });
 root.userData.landmarkColouring={version:1,display_only:true,groups,changed};
 return root.userData.landmarkColouring;
}
