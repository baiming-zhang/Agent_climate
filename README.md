# Agent Climate

温哥华三维SO₂预报情景：冻结2026-11-04 18:00 UTC起报，连续360小时至11月19日18:00 UTC。

**场景：** https://baiming-zhang.github.io/Agent_climate/forecast/

默认15秒播放完整15天，可调5–120秒；旋转缩放、灰色／自选色、原生0–20m地表查询、24h与15天均值、累计干湿沉降。16个实际AGL浓度层，源与初始背景分别保留。只插值浓度标量，无RGB帧混合、程序烟雾或等值面。

天气使用GFS前360h、9/3km与Noah-MP的私有WRF兼容JAX实现；输送为FLEXPART CPU8线程。用户授权24h降水网格RMSE≤2mm首版准入，原1mm失败保留。实际360小时Times、有限非负、ZERO和全球干湿／出域质量检查通过，不代表未来实测精度已被验证。

源为三个真实设施的2024年度率及有年代说明的烟囱热参数；NASA模型初始背景一次播种，没有后续完整域外化学入流，不是完整环境总浓度。SO₂无色，灰色仅作显示。建筑与地形为简化几何、高程显示1.8倍，无逐栋建筑CFD。

**计算、35处KaTeX公式、历史留出评价与本期质量收支：** https://baiming-zhang.github.io/Agent_climate/results/

**2021历史案例：** https://baiming-zhang.github.io/Agent_climate/historical/

保留295,252栋建筑与四个独立配色地标、UBC官方贴地校徽。原始地表查询F32与压缩体积显示分别储存，显示压缩误差在metadata列出。来源与许可见[THIRD_PARTY.md](./THIRD_PARTY.md)。
