"""Frozen MPTRAC module extension; reuse completed independent reference."""
import os, json, hashlib, subprocess, time
from pathlib import Path
import numpy as np
ROOT=Path('/mnt/c/Users/ASUS/Desktop/Agent_contact')
S=ROOT/'scripts/pollution_analytic_three_model_v2'
W=ROOT/'execution/pollution_analytic_three_model_v2'
OLD=ROOT/'execution/pollution_analytic_reference_v1'
B=Path('/home/research/vancouver-open3d-v2')
CORE=B/'private_common_modellevel_wind_r07_geopot_free'
HELP=ROOT/'scripts/pollution_vancouver_open3d_v2'
W.mkdir(parents=True,exist_ok=True)
(W/'scratch').mkdir(exist_ok=True)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,x): p.write_text(json.dumps(x,indent=2)+'\n')
assert not (W/'native_fields.bin').exists(), 'Do not repeat completed native benchmark'
design=json.loads((OLD/'comparison_design.frozen.json').read_text())
(W/'cells.txt').write_text('40\n'+''.join(f"{g['x_relative_m']} {g['y_relative_m']}\n" for g in design['groups']))
plan=dict(reference_sha256=sha(OLD/'truth/analytical_fields.npz'),old_design_sha256=sha(OLD/'comparison_design.frozen.json'),native_core_object_sha256=sha(CORE/'mptrac.o'),harness_sha256=sha(S/'mptrac_constant_K.c'),U_m_s=5,K_m2_s=50,Q_kg_s=.001,duration_s=7200,dt_s=10,particle_count=300000,seed=42,cells=40,time_means=12,source_births='stratified midpoints over continuous release',scope='Native MPTRAC advection and turbulent diffusion modules, matched rectangular cell and 600s time observer. Not full production workflow or terrain validation.',old_successful_models_recomputed=False)
save(W/'plan.frozen.json',plan)
env=os.environ.copy();env.update(OMP_NUM_THREADS='4',TMPDIR=str(W/'scratch'),GFORTRAN_TMPDIR=str(W/'scratch'))
cmd=['gcc','-O3','-fopenmp','-DHAVE_INLINE','-DEX=256','-DEY=256','-DEP=64','-DNP=500000','-DVANC_REGION_HOOK','-DVANC_PH_GEOMETRY',f'-I{B}/dependencies/include','-I/usr/include/hdf5/serial',f'-I{HELP}',f'-I{CORE}',str(S/'mptrac_constant_K.c'),str(HELP/'common_native_window_backend.c'),str(CORE/'mptrac.o'),str(HELP/'physical_height_above_surface.c'),f'-L{B}/dependencies/lib',f'-Wl,-rpath,{B}/dependencies/lib','-lgsl','-lgslcblas','-lnetcdf','-lm','-o',str(W/'native_benchmark')]
start=time.monotonic();save(W/'status.json',dict(stage='compiling',pid=os.getpid(),plan=plan))
with (W/'compile.log').open('w') as log: subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT,env=env,check=True,timeout=180)
save(W/'status.json',dict(stage='native_2h_benchmark',pid=os.getpid()))
with (W/'native.log').open('w') as log: subprocess.run([str(W/'native_benchmark'),'300000',str(W/'cells.txt'),str(W/'native_fields.bin'),str(W/'clock.csv')],stdout=log,stderr=subprocess.STDOUT,env=env,check=True,timeout=600)
native=np.fromfile(W/'native_fields.bin',dtype='<f8').reshape(12,40)
assert np.isfinite(native).all() and native.min()>=0
old=np.load(OLD/'comparison/paired_fields.npz'); truth=old['truth_ug_m2']
def metrics(x,ref):
 d=x-ref
 return dict(RMSE_ug_m2=float(np.sqrt(np.mean(d*d))),NRMSE_percent=float(100*np.sqrt(np.mean(d*d)/np.mean(ref*ref))),MAE_ug_m2=float(np.mean(abs(d))),bias_ug_m2=float(np.mean(d)),max_absolute_ug_m2=float(abs(d).max()),pairs=int(d.size))
results={name:metrics(x,truth) for name,x in [('FLEXPART',old['native_ug_m2']),('CALPUFF',old['CALPUFF_ug_m2']),('MPTRAC_native_modules',native)]}
results['CALPUFF_own_Draxler_companion']=metrics(old['CALPUFF_ug_m2'],old['Draxler_companion_ug_m2'])
save(W/'metrics.json',results)
np.savez_compressed(W/'paired_fields.npz',truth=truth,FLEXPART=old['native_ug_m2'],CALPUFF=old['CALPUFF_ug_m2'],MPTRAC_native_modules=native,x_m=old['x_m'],y_m=old['y_m'])
save(W/'status.json',dict(stage='completed',elapsed_seconds=time.monotonic()-start,metrics=results,physics_scope=plan['scope']))
print(json.dumps(results,indent=2))
