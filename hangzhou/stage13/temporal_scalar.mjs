// Shape-preserving cubic Hermite reconstruction of scalar concentration only.
// Native hourly means/queries are untouched. No rendered-image interpolation.
function slope(left,right){
 if(!((left>0&&right>0)||(left<0&&right<0)))return 0;
 return 2*left*right/(left+right);
}
export function temporalScalar(previous,first,next,following,t){
 const delta=next-first,m0=slope(first-previous,delta),m1=slope(delta,following-next);
 const t2=t*t,t3=t2*t;
 return Math.max(Math.min(first,next),Math.min(Math.max(first,next),
  (2*t3-3*t2+1)*first+(t3-2*t2+t)*m0+(-2*t3+3*t2)*next+(t3-t2)*m1));
}
export const temporalScalarGLSL=`
 float temporalSlope(float a,float b){
  if(!((a>0.&&b>0.)||(a<0.&&b<0.)))return 0.;
  return 2.*a*b/(a+b);
 }
 float temporalScalar(float p,float a,float b,float n,float t){
  float d=b-a,m0=temporalSlope(a-p,d),m1=temporalSlope(d,n-b),t2=t*t,t3=t2*t;
  return clamp((2.*t3-3.*t2+1.)*a+(t3-2.*t2+t)*m0+(-2.*t3+3.*t2)*b+(t3-t2)*m1,min(a,b),max(a,b));
 }
 vec2 temporalPair(vec2 p,vec2 a,vec2 b,vec2 n,float t){
  return vec2(temporalScalar(p.r,a.r,b.r,n.r,t),temporalScalar(p.g,a.g,b.g,n.g,t));
 }
`;
