'use strict';
// Render the documented equations, not bitmap formulas or raw TeX text.
const tex=String.raw;
const formulaChapters=[
 {id:'weather',number:'A',title:'三维天气：守恒方程与嵌套时间步',scope:'WRF天气求解；方程为物理关系的连续形式，实际程序使用其地形坐标、交错网格和离散耦合。',
  equations:[
   tex`\frac{\partial\rho}{\partial t}+\nabla\!\cdot(\rho\mathbf{u})=0`,
   tex`\frac{D\mathbf{u}}{Dt}=-\frac{1}{\rho}\nabla p-f\,\hat{\mathbf{k}}\!\times\!\mathbf{u}-g\hat{\mathbf{k}}+\mathbf{F}_{\rm turb}+\mathbf{F}_{\rm phys}`,
   tex`\frac{D\theta}{Dt}=\mathcal{Q}_{\rm rad}+\mathcal{Q}_{\rm latent}+\mathcal{Q}_{\rm PBL},\qquad T=\theta\left(\frac{p}{p_0}\right)^{R_d/c_p}`,
   tex`z=\frac{\mathrm{PH}+\mathrm{PHB}}{g},\qquad z_{\rm AGL}=z-h_{\rm terrain}`,
   tex`B(t_n+\tau)=\left(1-\frac{\tau}{18\,\mathrm{s}}\right)B_n+\frac{\tau}{18\,\mathrm{s}}B_{n+1},\quad\tau\in\{6,12,18\}\,\mathrm{s}`],
  symbols:'ρ：空气密度kg/m³；u=(u,v,w)：三维风m/s；p：Pa；θ：这里指干位温K；Q：位温变化率K/s；PH＋PHB：位势m²/s²；AGL：距当地地面高度。',
  notes:'月版为9/3 km两域、18/6秒步长、50层。父域推进18秒后，子域用6秒子步与时间插值边界推进。B表示经质量与地图因子耦合的边界量，不能直接把所有交错变量当作同一质量点标量。程序的湿位温另按原生定义转换，未与本式的干位温混用。辐射、云微物理、陆面与边界层共同决定风温和雨；没有用一根固定风向箭头代替整月天气。'},
 {id:'emission',number:'B',title:'排放：从年量到质量率与浮升',scope:'年排放率是先验；烟囱物理参数与天气决定浮升，不凭画面任意抬高。',
  equations:[
   tex`\begin{aligned}Q_j&=\frac{10^3\,M_{j,\rm annual}}{365\times24\times3600}\quad[\mathrm{kg\,s^{-1}}]\\\Delta m_j&=Q_j\Delta t\end{aligned}`,
   tex`F_b=\frac{g\,w_sD_s^2}{4}\frac{T_s-T_a}{T_s}\quad[\mathrm{m^4\,s^{-3}}]`,
   tex`\begin{aligned}\Delta h(x)&\approx1.6\,\frac{F_b^{1/3}x^{2/3}}{U}\\s&=\frac{g}{T_a}\frac{\partial\theta}{\partial z}\end{aligned}`, 
   tex`\begin{aligned}\Delta h_{\rm stable}&\approx2.6\left(\frac{F_b}{Us}\right)^{1/3}\\z_c&=h_s+\Delta h\end{aligned}`],
  symbols:'Mannual：t/年；Q：kg/s；ws：出口速度m/s；Ds：内径m；Ts、Ta：出口及环境温度K；Fb：浮力通量；U：公式中的源柱风速；x：下风距离m；s：稳定度s⁻²。',
  notes:'上式给出经典Briggs浮力主导分支的代表形式；实际计算还区分稳定／不稳定、动量主导、栈口下洗、最终浮升上限及低风筛查。近源120秒模式计算渐进浮升；月版释放序列使用逐时真实预报源柱估算终高。Briggs是亚网格烟羽参数化，不是解析喷口射流、完整热能方程或建筑尾流CFD。历史G系数属于2021训练重建；新月的2024年度源先验不乘旧G系数。'},
 {id:'dispersion',number:'C',title:'输送：三维平流、湍流与Gaussian质量核',scope:'区域模型使用FLEXPART随机粒子；近源模型使用Hanna／OU协方差和质量核。两条路径分别标注。',
  equations:[
   tex`d\mathbf{X}=\bigl[\mathbf{U}(\mathbf{X},t)+\mathbf{v}'\bigr]dt+\mathbf{e}_z\,d(\Delta h)`,
   tex`dv'=-\frac{v'}{T_L}dt+\sqrt{\frac{2\sigma_v^2}{T_L}}\,dW_t`,
   tex`\operatorname{Var}[X(t)-X(0)]=2\sigma_v^2T_L\left[t-T_L\left(1-e^{-t/T_L}\right)\right]`,
   tex`C_i(\mathbf{r},t)=\frac{m_i}{(2\pi)^{3/2}\sqrt{\det\Sigma_i}}\exp\!\left[-\frac12(\mathbf{r}-\mathbf{r}_i)^{\!T}\Sigma_i^{-1}(\mathbf{r}-\mathbf{r}_i)\right]`,
   tex`C_{i,\rm ground}(x,y,z)=C_i(x,y,z;z_i)+C_i(x,y,z;-z_i),\qquad z\ge0`],
  symbols:'X：粒子或烟团中心位置m；U：模拟风m/s；v′：未解析湍流速度m/s；TL：拉格朗日时间尺度s；σv：速度标准差m/s；Σ：位置协方差m²；mi：核携带的SO₂质量kg。',
  notes:'OU方程及方差闭式解用于说明一维、常系数、平稳速度的扩散关系；实际近源在随高度变化的天气中逐步更新，FLEXPART还包含其诊断湍流、非均匀混合和地面处理，不能把整套区域模型称为固定OU。近源每0.25秒释放归一化质量核，叠加真实高度风与Briggs浮升；地面镜像适用于局部平地。显示截4σ核尾不等于裁剪科学输出，建筑轮廓也没有自动进入流场求解。'},
 {id:'loss',number:'D',title:'清除：降雨、干沉降与累计沉积',scope:'下式湿清除参数对应独立近源诊断；区域输送使用原生FLEXPART气体干湿清除路径。',
  equations:[
   tex`\Lambda(P)=2\times10^{-5}P^{0.62}\quad[\mathrm{s^{-1}}],\qquad P\ [\mathrm{mm\,h^{-1}}]`,
   tex`m_i(t)=m_{i,0}\exp\!\left[-\int_{t_0}^{t}\Lambda(P(\tau))\,d\tau\right]`,
   tex`v_d\approx\frac{1}{r_a+r_b+r_c},\qquad F_{\rm dry}=v_dC_s`,
   tex`D_{\rm dry}(t)=\int_0^t F_{\rm dry}(\tau)\,d\tau\quad[\mathrm{kg\,m^{-2}}]`],
  symbols:'Λ：湿清除率s⁻¹；P：小时液当量雨量mm/h；vd：沉降速度m/s；ra、rb、rc：空气动力、边界层和地表阻力s/m；Cs：近地质量浓度kg/m³；D：累计面沉积kg/m²。',
  notes:'阻力串联式说明气体干沉降的主要物理关系，不替代原生模型随地表条件变化的全部分支。近源观测模式的历史雨量为0，清除本来很小；不能为显示夸大沉积。新月用每小时预报风雨，预期会遇到天气过程，但未来雨量不是实测。尚无完整SO₂氧化、液滴化学、雪冰清除和建筑表面反应；累计DRYDEP/WETDEP快照不能再按时间逐张相加。'},
 {id:'units',number:'E',title:'浓度与查询：质量单位、ppb和地表层平均',scope:'所有查询从物理场采样，颜色、显示强度和播放速度不进入浓度计算。',
  equations:[
   tex`C_{\rm ppb}=\frac{C_{\rm kg/m^3}}{M_{\rm SO_2}}\frac{RT}{p}\times10^9`,
   tex`\overline C_{0:20}=\frac{1}{20\,\mathrm{m}}\int_0^{20\,\mathrm{m}}C(z)\,dz`,
   tex`C(x,y)=(1-a)(1-b)C_{00}+a(1-b)C_{10}+(1-a)bC_{01}+abC_{11}`, 
   tex`C_{\rm ppb}=\frac{\mathrm{MIXINGRATIO}_{\rm numeric}}{1000},\qquad D_{\rm kg/m^2}=\frac{D_{\rm numeric}}{10^{12}}`],
  symbols:'MSO₂约0.064066 kg/mol；R约8.31446 J/(mol·K)；T为K、p为Pa；a、b为原生经纬网格单元内的无量纲权重。',
  notes:'区域查询读取原生0–20 m层平均；近源通过10点垂直求积计算同层平均。双线性权重用真实网格坐标，不能把经纬网格假作矩形UTM网格。范围外或未完成数据返回null，不返回假0。旧原生文件的MIXINGRATIO数值已经是molar ppt，尽管属性写by-mass；沉降数值是累计ng/m²，旧属性pg错误，上式按已核writer的真实数值换算。新月将源贡献与有限范围的初始背景贡献分开，后续外部化学入流缺口不自动补成完整环境浓度。'},
 {id:'fit',number:'F',title:'历史源重建：目标函数、约束和独立评分',scope:'这一节只解释2021训练／留出试验，新30天首版不重新拟合未来观测。',
  equations:[
   tex`\widehat y_i=b+\sum_{j=1}^{5}a_jH_{ij},\qquad a_j\ge0,\ b\ge0`,
   tex`\min_{\mathbf a,b\ge0}\left\{\sum_{i\in\mathcal T}\frac{\left(y_i-b-\sum_j a_jH_{ij}\right)^2}{n_{s(i)}\,\sigma_y^2}+\lambda\sum_{j=1}^{5}(a_j-1)^2\right\}`,
   tex`\mathrm{RMSE}=\sqrt{\frac1N\sum_{i=1}^{N}(\widehat y_i-y_i)^2},\quad\mathrm{MAE}=\frac1N\sum_i|\widehat y_i-y_i|,\quad\mathrm{Bias}=\frac1N\sum_i(\widehat y_i-y_i)`],
  symbols:'H：已包含名义年量释放的冻结响应列ppb，不再额外乘一次Q；a：无量纲源组乘子；b：常数背景ppb；ns(i)：该训练站报告数；σy：当前训练折观测标准差；T：训练报告集合。',
  notes:'训练目标对站点作平衡并按σy缩放，源系数向1作ridge正则，背景不受该ridge惩罚。12训练站整站留一CV，以站点宏平均RMSE选择λ；允许在最优值1%内取最大λ，实际选0.01。留出评分则对238条真实报告等权，不再套训练权重。只看总体1.623→0.882 ppb会遗漏区域0.463→0.863 ppb退化；预测先冻结、留出门不改。'},
 {id:'budget',number:'G',title:'质量预算与验收：数值完成不等于物理产品通过',scope:'整月输送尚待执行完毕，下面是运行后必须用实际输出核对的账本。',
  equations:[
   tex`M_{\rm init}+M_{\rm emitted}=M_{\rm airborne}+M_{\rm dry}+M_{\rm wet}+M_{\rm out}+\varepsilon_M`,
   tex`\epsilon_{\rm rel}=\frac{|\varepsilon_M|}{\max(M_{\rm init}+M_{\rm emitted},\,\epsilon_0)}`,
   tex`\mathrm{RMSE}_{P,k}=\sqrt{\frac1{N_g}\sum_{g=1}^{N_g}\bigl(P^{\rm GPU}_{g,k}-P^{\rm CPU}_{g,k}\bigr)^2}\le2\,\mathrm{mm}`],
  symbols:'所有M用kg；Mout为真实出域质量；εM为预算残差；Ng为原比较网格点数；P为累计RAINNC；k为25个比较时次之一。',
  notes:'原1 mm门与失败记录保持；用户授权首版将逐帧RAINNC网格RMSE上限改为2 mm，其它原字段和完整性要求不变。2 mm不是每个格点最大差，也不是SO₂预测误差或未来雨量精度保证。天气微小负水凝物原值披露、不截零；污染CONC/MIXINGRATIO/DRYDEP/WETDEP仍须有限非负，ZERO标签精确为0。月预算分开统计初始背景、三源及ZERO，区域内累计沉积只作为全球账本的一部分，不能把域外差额称为氧化。'},
 {id:'playback',number:'H',title:'显示：720小时如何变成15秒',scope:'仅改变观察时间的映射，不缩短物理积分，也不通过循环120秒凑一个月。',
  equations:[
   tex`\begin{aligned}t_{\rm sim}&=\frac{720\,\mathrm{h}}{15\,\mathrm{s}}\,t_{\rm play}\\&=48\,\frac{\mathrm{h}}{\mathrm{s}}\,t_{\rm play}\\0&\le t_{\rm play}\le15\,\mathrm{s}\end{aligned}`,
   tex`C(\mathbf x,t)=(1-\omega)C_n(\mathbf x)+\omega C_{n+1}(\mathbf x),\qquad\omega=\frac{t-t_n}{t_{n+1}-t_n}`,
   tex`\alpha(\mathbf r)=1-\exp\!\left[-g_{\rm vis}\int_{\rm ray}C(\mathbf r+\ell\mathbf d)\,d\ell\right]`],
  symbols:'tplay：真实播放秒；tsim：模拟经过小时；ω：物理时次插值权重；α：显示透明度；gvis：带相应倒数单位的视觉增益，不是SO₂吸光系数。',
  notes:'默认15秒，可调播放速度。插值发生在浓度、几何或位置层面，每帧重新绘制；不做RGB帧混合、叠帧或交叉淡化。月FLEX输出为实际小时平均及对应Times，显示须标明平均窗口，插值不产生新的分钟级科学预报。SO₂无色，灰色／自选颜色只帮助观察路径。完整720小时数据、地表和三维查询、沉降及质量检查完成后才切换月动画；当前历史预览继续明确标注范围。'}
];
function renderMethods(){
 const host=document.getElementById('equations');if(!host)return;
 host.innerHTML='<div class="formula-intro"><span class="eyebrow">EQUATIONS & IMPLEMENTATION</span><h3>方程、符号与实际近似</h3><p>先看物理关系，再看程序如何离散与验证。公式用KaTeX／MathML排版；连续方程并非声称实现了完整CFD。<span class="formula-swipe-hint">长公式可在框内横向滑动。</span></p></div>'+formulaChapters.map(c=>`<details class="math-chapter" ${['emission','playback'].includes(c.id)?'open':''}><summary><span>${c.number}</span><strong>${c.title}</strong><i>＋</i></summary><div class="math-content"><p class="math-scope">${c.scope}</p>${c.equations.map((e,i)=>`<div class="math-box" id="math-${c.id}-${i}"></div>`).join('')}<dl><dt>符号与单位</dt><dd>${c.symbols}</dd><dt>实际实现与边界</dt><dd>${c.notes}</dd></dl></div></details>`).join('');
 let rendered=0;
 formulaChapters.forEach(c=>c.equations.forEach((equation,i)=>{katex.render(equation,document.getElementById(`math-${c.id}-${i}`),{displayMode:true,throwOnError:true,strict:'error',trust:false,output:'htmlAndMathml'});rendered++;}));
 const previous=[tex`Q=\frac{10^3M_{\rm annual}}{8760\times3600}\quad[\mathrm{kg\,s^{-1}}]`,tex`d\mathbf X=\mathbf U(\mathbf X,t)\,dt+\mathrm{turbulent\ displacement}`,tex`\widehat y=b+\sum_{j=1}^{5}a_jH_j`,tex`t_{\rm sim}=t_{\rm play}\frac{720\,\mathrm{h}}{15\,\mathrm{s}}`];
 document.querySelectorAll('.equation').forEach((element,i)=>{katex.render(previous[i],element,{displayMode:true,throwOnError:true,trust:false});rendered++;});
 window.MATH_READY=true;window.MATH_EQUATION_COUNT=rendered;
}
try{renderMethods();}catch(error){console.error('LaTeX rendering failed:',error);document.getElementById('math-error').hidden=false;}
