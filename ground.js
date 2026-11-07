// WGS84 UTM zone10 north inverse; independently checked against PROJ/pyproj.
export function worldLonLat(world,origin){
 const e2=0.0066943799901413165,a=6378137,k=.9996,ep=e2/(1-e2),x=world.x*1000+origin[0]-500000,y=-world.z*1000+origin[1],
 e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2)),mu=y/k/(a*(1-e2/4-3*e2**2/64-5*e2**3/256)),
 p=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*Math.sin(4*mu)+151*e1**3/96*Math.sin(6*mu)+1097*e1**4/512*Math.sin(8*mu),
 n=a/Math.sqrt(1-e2*Math.sin(p)**2),r=a*(1-e2)/(1-e2*Math.sin(p)**2)**1.5,t=Math.tan(p)**2,c=ep*Math.cos(p)**2,d=x/(n*k),
 lat=p-n*Math.tan(p)/r*(d*d/2-(5+3*t+10*c-4*c*c-9*ep)*d**4/24+(61+90*t+298*c+45*t*t-252*ep-3*c*c)*d**6/720),
 lon=-123*Math.PI/180+(d-(1+2*t+c)*d**3/6+(5-2*c+28*t-3*c*c+8*ep+24*t*t)*d**5/120)/Math.cos(p);
 return[lon*180/Math.PI,lat*180/Math.PI];
}
