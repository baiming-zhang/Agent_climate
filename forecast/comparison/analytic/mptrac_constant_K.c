/* Native MPTRAC advection/diffusion kernels; prescribed Cartesian benchmark.
   This is a module-level verification with a matched cell/time observer,
   not the full Vancouver production/deposition/terrain configuration. */
#include "common_native_full_backend.h"
#include <assert.h>
void vanc_before_position(const ctl_t*c,cache_t*k,met_t*a,met_t*b,atm_t*p,int phase){(void)c;(void)k;(void)a;(void)b;(void)p;(void)phase;}
static int lookup[200][81];
int main(int argc,char**argv){
 assert(argc==5);int nmax=atoi(argv[1]);assert(nmax>0&&nmax<=NP);FILE*f=fopen(argv[2],"r");assert(f);int cells;assert(fscanf(f,"%d",&cells)==1&&cells==40);memset(lookup,-1,sizeof(lookup));
 for(int i=0;i<cells;i++){double x,y;assert(fscanf(f,"%lf %lf",&x,&y)==2);int ix=(int)llround(x/500)+20,iy=(int)llround(y/250)+40;assert(ix>=0&&ix<200&&iy>=0&&iy<81&&lookup[ix][iy]==-1);lookup[ix][iy]=i;}fclose(f);
 ctl_t*c=calloc(1,sizeof(*c));cache_t*k=calloc(1,sizeof(*k));clim_t*cl=calloc(1,sizeof(*cl));met_t*a=calloc(1,sizeof(*a)),*b=calloc(1,sizeof(*b));atm_t*p=calloc(1,sizeof(*p));assert(c&&k&&cl&&a&&b&&p);c->advect=2;c->advect_vert_coord=0;c->met_coord_type=1;c->met_utm_ref_lat=45;c->rng_type=1;c->turb_dx_pbl=c->turb_dx_trop=c->turb_dx_strat=50;c->turb_dz_pbl=c->turb_dz_trop=c->turb_dz_strat=.1;c->turb_pbl_trans=.1;c->turb_pbl_scheme=0;clim_tropo_init(cl);vanc_wind_enable(0);
 for(int m=0;m<2;m++){met_t*q=m?b:a;q->time=m?7200:0;q->coord_type=1;q->nx=q->ny=q->np=2;q->lon[0]=q->lat[0]=-100000;q->lon[1]=q->lat[1]=100000;q->p[0]=1000;q->p[1]=10;for(int x=0;x<2;x++)for(int y=0;y<2;y++){q->pbl[x][y]=900;q->ps[x][y]=1000;q->zs[x][y]=0;for(int z=0;z<2;z++){q->u[x][y][z]=5;q->v[x][y][z]=q->w[x][y][z]=0;q->t[x][y][z]=270;}}}
 /* Actual native constant-wind coordinate/clock control. */
 p->np=8;for(int i=0;i<8;i++){p->lon[i]=i*100;p->lat[i]=-i*100;p->p[i]=P(6);p->time[i]=0;k->dt[i]=10;}module_advect(c,k,a,b,p);for(int i=0;i<8;i++)assert(p->lon[i]==i*100+50&&p->lat[i]==-i*100&&p->p[i]==P(6)&&p->time[i]==10);
 /* Native Gaussian increment variance control; no analytic truth read. */
 p->np=100000;for(int i=0;i<p->np;i++){p->lon[i]=p->lat[i]=0;p->p[i]=P(6);p->time[i]=0;k->dt[i]=10;}module_rng_init(42);module_diff_turb(c,k,cl,a,b,p);double mx=0,my=0,vx=0,vy=0;for(int i=0;i<p->np;i++){mx+=p->lon[i];my+=p->lat[i];vx+=p->lon[i]*p->lon[i];vy+=p->lat[i]*p->lat[i];}mx/=p->np;my/=p->np;vx=vx/p->np-mx*mx;vy=vy/p->np-my*my;assert(fabs(mx)<6*sqrt(1000./p->np)&&fabs(my)<6*sqrt(1000./p->np)&&fabs(vx/1000-1)<.03&&fabs(vy/1000-1)<.03);
 p->np=0;module_rng_init(42);const double weight=7.2/nmax;double accum[40]={0},result[12][40]={{0}},outside_samples=0,maxmass=0;int next=0;double start=omp_get_wtime();FILE*clock=fopen(argv[4],"w");assert(clock);fprintf(clock,"seconds,particles,emitted_kg,airborne_kg,source_time_quadrature_error_kg\n");
 for(int t=10;t<=7200;t+=10){
  for(int i=0;i<p->np;i++)k->dt[i]=10;
  while(next<nmax&&((next+.5)*7200./nmax)<=t){int i=next++;double birth=(i+.5)*7200./nmax;p->time[i]=birth;p->lon[i]=p->lat[i]=0;p->p[i]=P(6);p->q[0][i]=weight;p->q[1][i]=0;k->dt[i]=t-birth;}
  p->np=next;module_advect(c,k,a,b,p);module_diff_turb(c,k,cl,a,b,p);
  unsigned long long count[40]={0},outside=0;double mass=0;
  #pragma omp parallel
  {unsigned long long local[40]={0},out=0;double partmass=0;
   #pragma omp for
   for(int i=0;i<p->np;i++){assert(isfinite(p->lon[i])&&isfinite(p->lat[i])&&isfinite(p->p[i])&&p->q[0][i]==weight&&p->q[1][i]==0&&fabs(p->time[i]-t)<1e-9);double z=1000*Z(p->p[i]);assert(z>=5200&&z<=6800);int ix=(int)floor((p->lon[i]+250)/500)+20,iy=(int)floor((p->lat[i]+125)/250)+40;int cell=(ix>=0&&ix<200&&iy>=0&&iy<81)?lookup[ix][iy]:-1;if(cell>=0)local[cell]++;else out++;partmass+=p->q[0][i];}
   #pragma omp critical
   {for(int i=0;i<40;i++)count[i]+=local[i];outside+=out;mass+=partmass;}}
  maxmass=fmax(maxmass,fabs(mass-next*weight));assert(fabs(mass-next*weight)<1e-10*fmax(1.,next*weight));unsigned long long n=outside;for(int i=0;i<40;i++){n+=count[i];accum[i]+=count[i]*weight*1e9/(500*250*60);}assert(n==(unsigned)p->np);outside_samples+=outside;
  if(t%600==0){for(int i=0;i<40;i++){result[t/600-1][i]=accum[i];accum[i]=0;}fprintf(clock,"%d,%d,%.17g,%.17g,%.17g\n",t,p->np,next*weight,mass,next*weight-t*.001);fflush(clock);}
 }
 fclose(clock);assert(p->np==nmax);f=fopen(argv[3],"wb");assert(f);assert(fwrite(result,sizeof(double),12*40,f)==12*40);fclose(f);printf("{\"native_particle_count\":%d,\"native_kernel_seconds\":%.17g,\"advection_control_exact\":true,\"increment_variance_x_m2\":%.17g,\"increment_variance_y_m2\":%.17g,\"source_mass_kg\":7.2,\"mass_error_max_kg\":%.17g,\"outside_fixed_output_cell_samples\":%.17g,\"scope\":\"native advection/diffusion module benchmark with matched cell and600s time observer, not full production model\"}\n",nmax,omp_get_wtime()-start,vx,vy,maxmass,outside_samples);
 return 0;
}
