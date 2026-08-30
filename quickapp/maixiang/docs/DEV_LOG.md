# 《脉象》openvela 版 AI Coding 开发日志

> 2026 首届 openvela AI 硬件开发者大赛参赛作品。
> 开发方式：AI Coding 辅助（人工决策 + AI 生成/重构/排错）。本文是阶段摘要，
> 不代替原始 AI 对话、Git 历史或赛事采集器日志。

## 2026-08-19：心率采集、存储状态与圆屏 UI 修复

本阶段围绕模拟器测量失败、主页返回闪烁、页面时间裁切和详情页顶部元素重叠进行修复。

### 心率采集

- 按官方 `service.health` 用法接入 `getRecentSamples` 和 `subscribeSample`，测量页进入后先读最近样本，再订阅实时样本。
- 在 `onDestroy` 解除订阅，避免页面返回后重复订阅或回调残留。
- 只接受 35～220 的有效心率，排除模拟器可能返回的 255 无效值；检测到超过 8 秒未更新时标记为过期。
- 测量流程使用设备健康服务提供的数据，不加入付费验证，也不依赖本地虚拟心率兜底。

### 存储与主页状态

- 保留 `@system.file` 串行队列存储和内存写穿缓存，降低异步写入后立即读取产生旧数据的概率。
- 主页启动时优先使用 `lastDiagnosis` 缓存，再执行一次持久化读取；增加加载令牌，忽略过期回调。
- 返回主页时不重复清空已有数据；测量成功通过 `homeNeedsRefresh` 通知主页刷新，修复“有数据/无数据来回切换”的闪烁。
- HRV 计算与测量记录的字段处理同步收敛，保持历史记录和主页诊断结果一致。

### 圆屏 UI

- 恢复主页已有的内联弧形时间实现，其他普通页面按同一布局对齐。
- 五维/六维详情页保留顶部弧形进度条，不再叠加时间。
- 修复脉象原理页时间被父容器裁切的问题：调整时钟容器位置，并移除内部时钟的负偏移。
- 雷达图容器补充相对定位，使背景网格图片和动态数据点保持正确叠加。
- 修正多个页面的圆屏内容高度、时间层和滚动区域，减少文字裁切及返回页面重绘异常。

### 验证与提交

- 本机 `npm run build` 通过。
- 从 GitHub `main` 全新克隆后，使用项目依赖构建成功并生成 `com.maixiang.pulse.debug.1.0.0.rpk`（1,102,328 字节）。
- 当前远程 `main` 与本地 `HEAD` 的跟踪文件一致。
- 本次修复主体提交为 `77385da`，远程历史合并提交为 `fb85043`。
- 由于 C 盘空间不足，尚未完成全新环境的依赖重新下载；本次克隆构建复用了本机同版本依赖，后续需在有足够空间的环境执行一次 `npm ci` 复核。

## 项目背景

《脉象》原为团队在 Zepp OS 平台开发的手表应用（心率规则分析 +
传统脉象六维/五脏平衡观察）。
本项目将其移植到 openvela 快应用平台，目标形态为 vela-miwear-watch（480×480 圆屏），
并单独维护小米手环 Pro 形态的适配工程（MaiXiang_miBandPro）。

## 阶段一：可行性评估

- 全量盘点 Zepp OS 版 16 页面 + 6 工具模块的 API 依赖（@zos/* 14 个模块）
- 调研 openvela 快应用文档（框架/组件/接口全目录）
- 结论：utils 算法层约 63% 平台无关可直接复用；UI 层需按 .ux MVVM 全部重写；
  健康传感器依赖大赛开放的 service.health 模块（HEART_RATE/SPO2/STRESS 采样族）

## 阶段二：核心移植

- manifest/路由/权限重建（service.health + hapjs.permission.HEALTH + background.features）
- 算法层平移：pulse_diagnosis（规则分析引擎）、hrv_calc（换算间期/熵/LF-VLF/RSA 统计）、
  hrv_storage_manager（按日分文件存储）、pulse_shape（脉形波点阵）
- 采集层重写：Zepp HeartRate.onCurrentChange → service.health subscribeSample 1Hz 订阅
- 10 个页面按 .ux 模板重写：splash/oobe/home/measurement/dim_showcase/
  organ_showcase/rec_showcase/pulse_explain/pulse_theory/about

## 阶段三：平台差异攻坚（踩坑记录）

1. transform rotate 三连坑（雷达图/弧形文本）：
   - 内联 style 绑定 transform 不生效 → 静态 CSS 类量化方案
   - 默认 transform-origin 不可靠 → 显式声明
   - rotate 正角为逆时针（与 CSS 相反）→ 角度取反
   - 最终放弃 transform：雷达网格改 Node 脚本预渲染 PNG（内置手写 PNG 编码器），
     数据多边形改绝对定位圆点阵虚线
2. 子组件 $watch 监听 prop 不触发 → "父算子渲"模式（父页面计算、子组件纯渲染）
3. 字库无 emoji 字形（渲染为豆腐块）→ 全部改用汉字/位图图标
4. 单边 border 渲染为整圈边框 → 分隔线一律用独立 div
5. list1.png 竖向平铺露接缝 → 固定底图 + scroll 上层滚动结构
6. aiot-toolkit 临时镜像目录损坏 → 删除 .temp_* 缓存重建
7. 存储时序竞态（写后立读）→ 内存写穿缓存层 + @system.file 异步持久化
8. 小内存设备文件清理要求 → 历史数据 14 天自动裁剪

## 阶段四：合规与工程化

- 保留关闭状态的 DEBUG 虚拟数据注入代码，参赛构建默认不注入模拟结果
- 开屏分流（首次打开→OOBE / 已完成引导→主页）；参赛版无付费激活和体验限制
- Apache 2.0 开源（LICENSE/NOTICE），素材声明（背景图为 Gemini AI 生成）
- 手环 Pro 版独立工程 fork（designWidth 缩放 + 全屏元素自适应改造）

## 平台经验沉淀

详见 docs/SKILL_vela_quickapp.md（openvela 快应用图形与 UI 适配技巧集）。
