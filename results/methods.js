'use strict';
// Render the documented equations, not bitmap formulas or raw TeX text.
const tex=String.raw;
const formulaChapters=[
 {id:'weather',number:'A',title:"3D weather: conservation and nested time stepping",scope:"Continuous physical equations describe the weather model. The implementation uses terrain-following coordinates, staggered variables and discrete coupling.",
  equations:[
   tex`\frac{\partial\rho}{\partial t}+\nabla\!\cdot(\rho\mathbf{u})=0`,
   tex`\frac{D\mathbf{u}}{Dt}=-\frac{1}{\rho}\nabla p-f\,\hat{\mathbf{k}}\!\times\!\mathbf{u}-g\hat{\mathbf{k}}+\mathbf{F}_{\rm turb}+\mathbf{F}_{\rm phys}`,
   tex`\frac{D\theta}{Dt}=\mathcal{Q}_{\rm rad}+\mathcal{Q}_{\rm latent}+\mathcal{Q}_{\rm PBL},\qquad T=\theta\left(\frac{p}{p_0}\right)^{R_d/c_p}`,
   tex`z=\frac{\mathrm{PH}+\mathrm{PHB}}{g},\qquad z_{\rm AGL}=z-h_{\rm terrain}`,
   tex`B(t_n+\tau)=\left(1-\frac{\tau}{18\,\mathrm{s}}\right)B_n+\frac{\tau}{18\,\mathrm{s}}B_{n+1},\quad\tau\in\{6,12,18\}\,\mathrm{s}`],
  symbols:"ρ: air density, kg/m³; u=(u,v,w): 3D wind, m/s; p: Pa; θ: dry potential temperature, K; Q: potential-temperature tendency, K/s; PH+PHB: geopotential, m²/s²; AGL: height above local ground.",
  notes:"The release uses 9/3 km domains, 18/6 s steps and 50 atmospheric levels. The parent advances 18 s and the child takes three 6 s steps using interpolated coupled boundary data. Dry and moist potential-temperature definitions are kept distinct. Radiation, cloud microphysics, land exchange and the PBL determine the changing wind, temperature and precipitation. This is an independent WRF-compatible JAX implementation, not an official NCAR GPU build."},
 {id:'emission',number:'B',title:"Outlet-origin emissions and finite-density thermal rise",scope:"Report coordinates, height, diameter, exit speed and temperature define each release. Dry integral entrainment is parameterized; it is not resolved stack/building CFD.",
  equations:[
   tex`Q_j=\frac{10^3M_{j,\rm annual}}{365\cdot24\cdot3600},\quad\Delta m_j=Q_j\Delta t,\quad z(0)=h_{s,j}`,
   tex`\mathbf P=m\mathbf V,\quad H=m\theta_p,\quad T_p=\frac{H}{m}\left(\frac{p_a}{p_0}\right)^{2/7},\quad\rho_p=\frac{p_a}{R_dT_p},\quad b=\sqrt{\frac{m}{\rho_p\pi|\mathbf V|}}`,
   tex`\frac{dm}{da}=2\pi b\rho_a|\mathbf V|\left(0.10\left|(\mathbf V-\mathbf U_a)\cdot\hat{\mathbf V}\right|+0.60\left|\mathbf U_a-(\mathbf U_a\cdot\hat{\mathbf V})\hat{\mathbf V}\right|\right)`,
   tex`\frac{d\mathbf P}{da}=\mathbf U_a\frac{dm}{da}+g\left(\frac{\rho_a}{\rho_p}-1\right)m\mathbf e_z,\quad\frac{dH}{da}=\theta_a\frac{dm}{da},\quad\frac{d\mathbf X_p}{da}=\mathbf V`,
   tex`m(0)=\frac{p_a(h_s)}{R_dT_s}\pi\left(\frac{D_s}{2}\right)^2V_s,\quad\mathbf V(0)=V_s\mathbf e_z,\quad\theta_p(0)=T_s\left(\frac{p_0}{p_a(h_s)}\right)^{2/7}`],
  symbols:"Q: SO₂ mass rate, kg/s; M: tonnes/year. a: parcel age, s. m: carrier-gas mass flux, kg/s; P: momentum flux, kg·m/s²; H: potential-temperature flux, kg·K/s. b: integral radius, m. Uₐ, θₐ, pₐ and ρₐ are actual frozen ambient profiles. Rd=287.05 J/(kg·K). m is not SO₂ mass.",
  notes:"All 1,800 hourly component releases start on the reported outlet disk at 76.2,60 or 118 m AGL. The old Briggs final-height injection and camera-facing origin guide are replaced. The prescribed wind has 50 levels with distinct u,v,w. SO₂ has no feedback on it. Entrainment coefficients 0.10/0.60 are declared closure assumptions, not fitted pollution parameters. The 1,800 integral systems were batched on CUDA and checked against adaptive CPU solutions. The 15-minute integral table is per-parcel age, not forecast duration; the same source mass continues through the full 360-hour native transport. Its samples are 0.25 s apart; the residual relative drift subsequently decays with a declared 60 s tail. Exhaust moisture, building wakes and two-way meteorological heating are not resolved. Source 2024 annual/thermal priors remain unchanged."},
 {id:'dispersion',number:'C',title:"One-way 3D transport, jet spread and concentration",scope:"The same native particles carry source mass from the outlet to the regional atmosphere. Local and regional grids are alternative samplings of these trajectories.",
  equations:[
   tex`\mathbf D(a)=\mathbf X_p(a)-\mathbf X_p(0)-\int_0^a\mathbf U_a(z_p(s))\,ds`,
   tex`d\mathbf X=\mathbf U(\mathbf X,t)\,dt+\mathbf v'\,dt+d\mathbf D(a)+d\boldsymbol\xi_{\rm jet},\quad d\mathbf U\big|_{\rm SO_2}=0`,
   tex`dv'=-\frac{v'}{T_L}dt+\sqrt{\frac{2\sigma_v^2}{T_L}}\,dW_t`,
   tex`S(a)=\max_{0\le s\le a}\frac{b(s)^2}{4},\quad\operatorname{Cov}(d\boldsymbol\xi_{\rm jet})=dS\left(\mathbf I-\hat{\mathbf V}\hat{\mathbf V}^{T}\right)`,
   tex`\overline C_k=\frac{1}{\Delta t\,\Delta V_k}\sum_i m_{{\rm SO_2},i}\int_{t_n}^{t_{n+1}}\mathbf 1_{\mathbf X_i(t)\in V_k}\,dt`],
  symbols:"D: mean-jet excess displacement beyond ambient advection, m. v′: native unresolved turbulent velocity. S: irreversible cross-jet variance, m²; ξjet: transverse stochastic displacement. C̄: hourly local mass concentration, kg/m³. ΔVk is the actual nonuniform 3D cell volume.",
  notes:"The native solver evaluates the changing 3D weather at particle position/height. During each parcel’s first 900 s of age, particles are advanced in 1 s subintervals; later transport uses the native adaptive procedure. Source mass, dry/wet removal and real boundary outflow retain a global ledger. The local 96³ fields use trajectory residence-time remeshing with piecewise-linear paths; bin widths are not claims of sub-metre CFD accuracy. These fields contain the same particles as the 16-layer regional output and are not additional sources. Native turbulence and parameterized jet spreading are both explicit model assumptions; no visual noise is injected. The OU expression summarizes decorrelation; native inhomogeneous/well-mixed drift terms are retained. Finite particle sampling and lack of particle-count convergence limit local accuracy. Near-nozzle fine-bin peaks are not validated point concentrations or engineering exposure estimates."},
 {id:'loss',number:'D',title:"Removal: precipitation, dry deposition and accumulation",scope:"The empirical wet-removal expression below belongs to the archived near-source diagnostic. The regional calculation uses native FLEXPART gas-removal pathways.",
  equations:[
   tex`\Lambda(P)=2\times10^{-5}P^{0.62}\quad[\mathrm{s^{-1}}],\qquad P\ [\mathrm{mm\,h^{-1}}]`,
   tex`m_i(t)=m_{i,0}\exp\!\left[-\int_{t_0}^{t}\Lambda(P(\tau))\,d\tau\right]`,
   tex`v_d\approx\frac{1}{r_a+r_b+r_c},\qquad F_{\rm dry}=v_dC_s`,
   tex`D_{\rm dry}(t)=\int_0^t F_{\rm dry}(\tau)\,d\tau\quad[\mathrm{kg\,m^{-2}}]`],
  symbols:"Λ: wet-removal rate, s⁻¹; P: liquid-equivalent precipitation, mm/h; vd: deposition velocity, m/s; ra, rb, rc: aerodynamic, boundary-layer and surface resistances, s/m; Cs: near-surface mass concentration, kg/m³; D: cumulative deposition, kg/m².",
  notes:"The resistance expression summarizes the main dry-deposition relation, not every native surface branch. The 15-day simulation uses the actual hourly forecast precipitation and native dry/wet loss. The weather contains 133 hours with at least one selected-city cell exceeding 0.1 mm/h and approximately 72 mm mean cumulative water-equivalent precipitation in that rectangle. Rain glyphs follow these data. Tinted drops encode wet removal; gaseous SO₂ is not a falling solid particle. No second visual sink is applied. Oxidation, detailed droplet chemistry, ice/snow removal and building-surface chemistry remain limited. Never sum cumulative deposition snapshots."},
 {id:'units',number:'E',title:"Concentration: units, ppb and surface-layer means",scope:"Queries sample physical scalar fields. Colour, display strength and playback speed never enter the concentration calculation.",
  equations:[
   tex`C_{\rm ppb}=\frac{C_{\rm kg/m^3}}{M_{\rm SO_2}}\frac{RT}{p}\times10^9`,
   tex`\overline C_{0:20}=\frac{1}{20\,\mathrm{m}}\int_0^{20\,\mathrm{m}}C(z)\,dz`,
   tex`C(x,y)=(1-a)(1-b)C_{00}+a(1-b)C_{10}+(1-a)bC_{01}+abC_{11}`, 
   tex`C_{\rm ppb}=\frac{\mathrm{MIXINGRATIO}_{\rm numeric}}{1000},\qquad D_{\rm kg/m^2}=\frac{D_{\rm numeric}}{10^{12}}`],
  symbols:"MSO₂≈0.064066 kg/mol; R≈8.31446 J/(mol·K); T: K; p: Pa. a and b are dimensionless coordinates within the actual native longitude/latitude cell.",
  notes:"Surface queries use the native 0–20 m layer mean. The archived near-source interface uses 10-point vertical quadrature. Native axes are sampled after the actual UTM-to-lon/lat transform, rather than treating the curved grid as a UTM rectangle. Outside or unavailable values are null. Legacy MIXINGRATIO numbers are molar ppt despite the by-mass attribute. Deposition numbers are cumulative ng/m² despite a legacy pg attribute. Tiny positive values are shown with significant figures or scientific notation, never rounded to a displayed zero. The current release reports three-source increments only; unqualified background propagation is excluded."},
 {id:'fit',number:'F',title:"Historical inference: objective, constraints and held-out scoring",scope:"This chapter documents the 2021 training/held-out experiment. No future observations are fitted in the 15-day release.",
  equations:[
   tex`\widehat y_i=b+\sum_{j=1}^{5}a_jH_{ij},\qquad a_j\ge0,\ b\ge0`,
   tex`\min_{\mathbf a,b\ge0}\left\{\sum_{i\in\mathcal T}\frac{\left(y_i-b-\sum_j a_jH_{ij}\right)^2}{n_{s(i)}\,\sigma_y^2}+\lambda\sum_{j=1}^{5}(a_j-1)^2\right\}`,
   tex`\mathrm{RMSE}=\sqrt{\frac1N\sum_{i=1}^{N}(\widehat y_i-y_i)^2},\quad\mathrm{MAE}=\frac1N\sum_i|\widehat y_i-y_i|,\quad\mathrm{Bias}=\frac1N\sum_i(\widehat y_i-y_i)`],
  symbols:"H: frozen response columns in ppb, already containing nominal annual-rate emissions; a: dimensionless source-group multipliers; b: constant background, ppb; ns(i): training-report count at a station; σy: observation standard deviation within the training fold; T: training reports.",
  notes:"Station-balanced training residuals are scaled by the fold standard deviation. Source multipliers receive a ridge penalty toward 1; the constant background does not. Leave-one-training-station-out CV selects the regularization strength, allowing the largest value within 1% of the optimum; the selected value is 0.01. Held-out scoring gives equal weight to 238 actual station-hour reports. Overall RMSE improves 1.623→0.882 ppb, while the regional stratum worsens 0.463→0.863 ppb. The original held-out gate therefore remains failed."},
 {id:'budget',number:'G',title:"Mass balance and qualification",scope:"The completed 360-hour source transport has a native ledger. Mass conservation alone does not establish local concentration accuracy.",
  equations:[
   tex`M_{\rm init}+M_{\rm emitted}=M_{\rm airborne}+M_{\rm dry}+M_{\rm wet}+M_{\rm out}+\varepsilon_M`,
   tex`\epsilon_{\rm rel}=\frac{|\varepsilon_M|}{\max(M_{\rm init}+M_{\rm emitted},\,\epsilon_0)}`,
   tex`\mathrm{RMSE}_{P,k}=\sqrt{\frac1{N_g}\sum_{g=1}^{N_g}\bigl(P^{\rm GPU}_{g,k}-P^{\rm CPU}_{g,k}\bigr)^2}\le2\,\mathrm{mm}`],
  symbols:"All masses are kg. Mout is actual boundary outflow. εM is the ledger residual. Ng is the unchanged comparison-grid size. P is cumulative RAINNC; k indexes the 25 comparison times.",
  notes:"The original 1 mm criterion and all failed branches are preserved. The user-authorized first release changes only per-frame RAINNC grid-RMSE to≤2 mm; other field and integrity checks are retained. This is not a per-cell maximum bound, an SO₂ error bound or validation against future rain observations. The accepted 24 h comparison reaches 1.405205 mm. Weather micro-negative hydrometeors remain unmodified. Pollutant fields must be finite and nonnegative, with the ZERO control exactly zero. Initial-background mass conservation passed, but particle concentration fidelity did not; it is not included in the released source increments."},
 {id:'playback',number:'H',title:"Display: 360 simulated hours in 15 seconds",scope:"Playback changes the viewing clock, never the physical integration length. A short release is not looped to manufacture 15 days.",
  equations:[
   tex`\begin{aligned}t_{\rm sim}&=\frac{360\,\mathrm{h}}{15\,\mathrm{s}}\,t_{\rm play}\\& =24\,\frac{\mathrm{h}}{\mathrm{s}}\,t_{\rm play}\\0&\le t_{\rm play}\le15\,\mathrm{s}\end{aligned}`,
   tex`C(\mathbf x,t)=(1-\omega)C_n(\mathbf x)+\omega C_{n+1}(\mathbf x),\qquad\omega=\frac{t-t_n}{t_{n+1}-t_n}`,
   tex`r_g=f_g(x,y,z),\quad w_g=\frac{r_g}{\max(1,\sum_jr_j)},\quad w_{\rm regional}=\max(0,1-\sum_jr_j),\quad\sum_gw_g+w_{\rm regional}=1`,
   tex`C_{\rm display}=w_{\rm regional}C_{\rm regional}+\sum_gw_gC_g`,
   tex`\alpha(\mathbf r)=1-\exp\!\left[-g_{\rm vis}\int_{\rm ray}C(\mathbf r+\ell\mathbf d)\,d\ell\right]`],
  symbols:"tplay: wall-clock seconds; tsim: simulated hours; ω: scalar time-interpolation weight; α: display opacity; gvis: visual gain with reciprocal units, not a physical SO₂ absorption coefficient.",
  notes:"The default is 15 s, with slower/faster playback and an adjustable full-period duration. Concentrations, geometry and positions are interpolated and rerendered; RGB images are never blended or cross-faded. Every native frame is an actual hourly mean, not a new minute-resolved forecast. All 16 native AGL output layers are retained. Display scalars are compressed and decoded before GPU interpolation; native ground queries retain F32 values. SO₂ is invisible: grey/custom colour is an observation aid, not a visible-smoke prediction."}
];
function renderMethods(){
 const host=document.getElementById('equations');if(!host)return;
 host.innerHTML='<div class="formula-intro"><span class="eyebrow">EQUATIONS & IMPLEMENTATION</span><h3>Equations, symbols and implementation limits</h3><p>Physical relations, discretization and validation. Equations use KaTeX/MathML; continuous equations do not claim a fully resolved CFD calculation.<span class="formula-swipe-hint">Scroll within long equations.</span></p></div>'+formulaChapters.map(c=>`<details class="math-chapter" ${['emission','playback'].includes(c.id)?'open':''}><summary><span>${c.number}</span><strong>${c.title}</strong><i>＋</i></summary><div class="math-content"><p class="math-scope">${c.scope}</p>${c.equations.map((e,i)=>`<div class="math-box" id="math-${c.id}-${i}"></div>`).join('')}<dl><dt>Symbols and units</dt><dd>${c.symbols}</dd><dt>Implementation and limitations</dt><dd>${c.notes}</dd></dl></div></details>`).join('');
 let rendered=0;
 formulaChapters.forEach(c=>c.equations.forEach((equation,i)=>{katex.render(equation,document.getElementById(`math-${c.id}-${i}`),{displayMode:true,throwOnError:true,strict:'error',trust:false,output:'htmlAndMathml'});rendered++;}));
 const previous=[tex`Q=\frac{10^3M_{\rm annual}}{8760\times3600}\quad[\mathrm{kg\,s^{-1}}]`,tex`d\mathbf X=\mathbf U(\mathbf X,t)\,dt+\mathrm{turbulent\ displacement}`,tex`\widehat y=b+\sum_{j=1}^{5}a_jH_j`,tex`t_{\rm sim}=t_{\rm play}\frac{360\,\mathrm{h}}{15\,\mathrm{s}}`];
 document.querySelectorAll('.equation').forEach((element,i)=>{katex.render(previous[i],element,{displayMode:true,throwOnError:true,trust:false});rendered++;});
 window.MATH_READY=true;window.MATH_EQUATION_COUNT=rendered;
}
try{renderMethods();}catch(error){console.error('LaTeX rendering failed:',error);document.getElementById('math-error').hidden=false;}
