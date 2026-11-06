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
 {id:'emission',number:'B',title:"Emissions: annual mass, source rate and plume rise",scope:"Annual emissions are priors. Reported stack parameters and hourly forecast columns determine the rise parameterization.",
  equations:[
   tex`\begin{aligned}Q_j&=\frac{10^3\,M_{j,\rm annual}}{365\times24\times3600}\quad[\mathrm{kg\,s^{-1}}]\\\Delta m_j&=Q_j\Delta t\end{aligned}`,
   tex`F_b=\frac{g\,w_sD_s^2}{4}\frac{T_s-T_a}{T_s}\quad[\mathrm{m^4\,s^{-3}}]`,
   tex`\begin{aligned}\Delta h(x)&\approx1.6\,\frac{F_b^{1/3}x^{2/3}}{U}\\s&=\frac{g}{T_a}\frac{\partial\theta}{\partial z}\end{aligned}`, 
   tex`\begin{aligned}\Delta h_{\rm stable}&\approx2.6\left(\frac{F_b}{Us}\right)^{1/3}\\z_c&=h_s+\Delta h\end{aligned}`],
  symbols:"Mannual: tonnes/year; Q: kg/s; ws: stack exit speed, m/s; Ds: internal diameter, m; Ts and Ta: exit and ambient temperature, K; Fb: buoyancy flux; U: source-column wind; x: downwind distance, m; s: stability, s⁻².",
  notes:"These are representative buoyancy-dominated Briggs branches. The source serializer also handles stability, momentum dominance, stack-tip downwash, final-rise limits and a documented low-wind floor. Every forecast hour uses the actual source-column weather. Native FLEXPART injects at the estimated final rise; it does not resolve a gradual hot jet. The visible stack-to-layer path is an origin guide, not an additional queried concentration field. The 2024 source priors are not multiplied by the archived 2021 fitted coefficients."},
 {id:'dispersion',number:'C',title:"Transport: 3D advection, turbulence and Gaussian mass kernels",scope:"Regional transport uses native FLEXPART particles. The archived near-source model uses Hanna/OU covariance and Gaussian kernels; these are separate calculations.",
  equations:[
   tex`d\mathbf{X}=\bigl[\mathbf{U}(\mathbf{X},t)+\mathbf{v}'\bigr]dt+\mathbf{e}_z\,d(\Delta h)`,
   tex`dv'=-\frac{v'}{T_L}dt+\sqrt{\frac{2\sigma_v^2}{T_L}}\,dW_t`,
   tex`\operatorname{Var}[X(t)-X(0)]=2\sigma_v^2T_L\left[t-T_L\left(1-e^{-t/T_L}\right)\right]`,
   tex`C_i(\mathbf{r},t)=\frac{m_i}{(2\pi)^{3/2}\sqrt{\det\Sigma_i}}\exp\!\left[-\frac12(\mathbf{r}-\mathbf{r}_i)^{\!T}\Sigma_i^{-1}(\mathbf{r}-\mathbf{r}_i)\right]`,
   tex`C_{i,\rm ground}(x,y,z)=C_i(x,y,z;z_i)+C_i(x,y,z;-z_i),\qquad z\ge0`],
  symbols:"X: particle or puff centre, m; U: resolved wind, m/s; v′: unresolved turbulent velocity, m/s; TL: Lagrangian timescale, s; σv: velocity standard deviation; Σ: position covariance, m²; mi: SO₂ mass carried by a kernel, kg.",
  notes:"The OU equation and closed-form variance illustrate a stationary one-dimensional constant-coefficient case. Actual native turbulence is spatially variable. The supported regional pathway is TURB1/SFC0, not direct ingestion of HFX/UST/PBLH. The archived near-source calculation releases normalized kernels every0.25 s and uses height-dependent wind and Briggs rise. Its flat-ground image term and visual4σ support do not imply that buildings are resolved in the air-flow solution."},
 {id:'loss',number:'D',title:"Removal: precipitation, dry deposition and accumulation",scope:"The empirical wet-removal expression below belongs to the archived near-source diagnostic. The regional calculation uses native FLEXPART gas-removal pathways.",
  equations:[
   tex`\Lambda(P)=2\times10^{-5}P^{0.62}\quad[\mathrm{s^{-1}}],\qquad P\ [\mathrm{mm\,h^{-1}}]`,
   tex`m_i(t)=m_{i,0}\exp\!\left[-\int_{t_0}^{t}\Lambda(P(\tau))\,d\tau\right]`,
   tex`v_d\approx\frac{1}{r_a+r_b+r_c},\qquad F_{\rm dry}=v_dC_s`,
   tex`D_{\rm dry}(t)=\int_0^t F_{\rm dry}(\tau)\,d\tau\quad[\mathrm{kg\,m^{-2}}]`],
  symbols:"Λ: wet-removal rate, s⁻¹; P: liquid-equivalent precipitation, mm/h; vd: deposition velocity, m/s; ra, rb, rc: aerodynamic, boundary-layer and surface resistances, s/m; Cs: near-surface mass concentration, kg/m³; D: cumulative deposition, kg/m².",
  notes:"The resistance expression summarizes the main dry-deposition relation, not every native surface branch. The 15-day simulation uses the actual hourly forecast precipitation and native dry/wet loss. The weather contains133 hours with at least one selected-city cell exceeding0.1 mm/h and approximately72 mm mean cumulative water-equivalent precipitation in that rectangle. Rain glyphs follow these data. Tinted drops encode wet removal; gaseous SO₂ is not a falling solid particle. No second visual sink is applied. Oxidation, detailed droplet chemistry, ice/snow removal and building-surface chemistry remain limited. Never sum cumulative deposition snapshots."},
 {id:'units',number:'E',title:"Concentration: units, ppb and surface-layer means",scope:"Queries sample physical scalar fields. Colour, display strength and playback speed never enter the concentration calculation.",
  equations:[
   tex`C_{\rm ppb}=\frac{C_{\rm kg/m^3}}{M_{\rm SO_2}}\frac{RT}{p}\times10^9`,
   tex`\overline C_{0:20}=\frac{1}{20\,\mathrm{m}}\int_0^{20\,\mathrm{m}}C(z)\,dz`,
   tex`C(x,y)=(1-a)(1-b)C_{00}+a(1-b)C_{10}+(1-a)bC_{01}+abC_{11}`, 
   tex`C_{\rm ppb}=\frac{\mathrm{MIXINGRATIO}_{\rm numeric}}{1000},\qquad D_{\rm kg/m^2}=\frac{D_{\rm numeric}}{10^{12}}`],
  symbols:"MSO₂≈0.064066 kg/mol; R≈8.31446 J/(mol·K); T: K; p: Pa. a and b are dimensionless coordinates within the actual native longitude/latitude cell.",
  notes:"Surface queries use the native0–20 m layer mean. The archived near-source interface uses10-point vertical quadrature. Native axes are sampled after the actual UTM-to-lon/lat transform, rather than treating the curved grid as a UTM rectangle. Outside or unavailable values are null. Legacy MIXINGRATIO numbers are molar ppt despite the by-mass attribute. Deposition numbers are cumulative ng/m² despite a legacy pg attribute. Tiny positive values are shown with significant figures or scientific notation, never rounded to a displayed zero. The current release reports three-source increments only; unqualified background propagation is excluded."},
 {id:'fit',number:'F',title:"Historical inference: objective, constraints and held-out scoring",scope:"This chapter documents the 2021 training/held-out experiment. No future observations are fitted in the 15-day release.",
  equations:[
   tex`\widehat y_i=b+\sum_{j=1}^{5}a_jH_{ij},\qquad a_j\ge0,\ b\ge0`,
   tex`\min_{\mathbf a,b\ge0}\left\{\sum_{i\in\mathcal T}\frac{\left(y_i-b-\sum_j a_jH_{ij}\right)^2}{n_{s(i)}\,\sigma_y^2}+\lambda\sum_{j=1}^{5}(a_j-1)^2\right\}`,
   tex`\mathrm{RMSE}=\sqrt{\frac1N\sum_{i=1}^{N}(\widehat y_i-y_i)^2},\quad\mathrm{MAE}=\frac1N\sum_i|\widehat y_i-y_i|,\quad\mathrm{Bias}=\frac1N\sum_i(\widehat y_i-y_i)`],
  symbols:"H: frozen response columns in ppb, already containing nominal annual-rate emissions; a: dimensionless source-group multipliers; b: constant background, ppb; ns(i): training-report count at a station; σy: observation standard deviation within the training fold; T: training reports.",
  notes:"Station-balanced training residuals are scaled by the fold standard deviation. Source multipliers receive a ridge penalty toward1; the constant background does not. Leave-one-training-station-out CV selects the regularization strength, allowing the largest value within1% of the optimum; the selected value is0.01. Held-out scoring gives equal weight to238 actual station-hour reports. Overall RMSE improves1.623→0.882 ppb, while the regional stratum worsens0.463→0.863 ppb. The original held-out gate therefore remains failed."},
 {id:'budget',number:'G',title:"Mass balance and qualification",scope:"The completed 360-hour source transport has a native ledger. Mass conservation alone does not establish local concentration accuracy.",
  equations:[
   tex`M_{\rm init}+M_{\rm emitted}=M_{\rm airborne}+M_{\rm dry}+M_{\rm wet}+M_{\rm out}+\varepsilon_M`,
   tex`\epsilon_{\rm rel}=\frac{|\varepsilon_M|}{\max(M_{\rm init}+M_{\rm emitted},\,\epsilon_0)}`,
   tex`\mathrm{RMSE}_{P,k}=\sqrt{\frac1{N_g}\sum_{g=1}^{N_g}\bigl(P^{\rm GPU}_{g,k}-P^{\rm CPU}_{g,k}\bigr)^2}\le2\,\mathrm{mm}`],
  symbols:"All masses are kg. Mout is actual boundary outflow. εM is the ledger residual. Ng is the unchanged comparison-grid size. P is cumulative RAINNC; k indexes the 25 comparison times.",
  notes:"The original1 mm criterion and all failed branches are preserved. The user-authorized first release changes only per-frame RAINNC grid-RMSE to≤2 mm; other field and integrity checks are retained. This is not a per-cell maximum bound, an SO₂ error bound or validation against future rain observations. The accepted24 h comparison reaches1.405205 mm. Weather micro-negative hydrometeors remain unmodified. Pollutant fields must be finite and nonnegative, with the ZERO control exactly zero. Initial-background mass conservation passed, but particle concentration fidelity did not; it is not included in the released source increments."},
 {id:'playback',number:'H',title:"Display: 360 simulated hours in 15 seconds",scope:"Playback changes the viewing clock, never the physical integration length. A short release is not looped to manufacture 15 days.",
  equations:[
   tex`\begin{aligned}t_{\rm sim}&=\frac{360\,\mathrm{h}}{15\,\mathrm{s}}\,t_{\rm play}\\& =24\,\frac{\mathrm{h}}{\mathrm{s}}\,t_{\rm play}\\0&\le t_{\rm play}\le15\,\mathrm{s}\end{aligned}`,
   tex`C(\mathbf x,t)=(1-\omega)C_n(\mathbf x)+\omega C_{n+1}(\mathbf x),\qquad\omega=\frac{t-t_n}{t_{n+1}-t_n}`,
   tex`\alpha(\mathbf r)=1-\exp\!\left[-g_{\rm vis}\int_{\rm ray}C(\mathbf r+\ell\mathbf d)\,d\ell\right]`],
  symbols:"tplay: wall-clock seconds; tsim: simulated hours; ω: scalar time-interpolation weight; α: display opacity; gvis: visual gain with reciprocal units, not a physical SO₂ absorption coefficient.",
  notes:"The default is15 s, with slower/faster playback and an adjustable full-period duration. Concentrations, geometry and positions are interpolated and rerendered; RGB images are never blended or cross-faded. Every native frame is an actual hourly mean, not a new minute-resolved forecast. All16 native AGL output layers are retained. Display scalars are compressed and decoded before GPU interpolation; native ground queries retain F32 values. SO₂ is invisible: grey/custom colour is an observation aid, not a visible-smoke prediction."}
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
