# 脉象（MaiXiang）openvela 版

《脉象》是面向 openvela 智能手表的健康观察与传统脉学科普快应用，也是「2026 首届 openvela AI 硬件开发者大赛」参赛项目。

应用读取设备健康服务提供的心率采样，在设备端进行统计和经验规则分析，以脉象、六维指标、体质与五脏平衡趋势等形式呈现结果。相关结果仅用于健康科普和个人观察，不构成医疗诊断，也不能替代专业医疗建议。

## 项目特点

- openvela 圆屏快应用原生界面（480×480，`designWidth` 480）
- 设备端心率采样、规则分析与文件持久化
- 六维脉象与五脏平衡雷达图
- 脉象科普、结果解读与养生参考
- 从团队自有 Zepp OS 版本迁移并针对 openvela 重写界面和平台接口
- 使用 AI Coding 辅助迁移、重构、调试和文档整理

## 技术亮点

- **串行队列存储**：基于回调链的文件 I/O 队列，按文件名串行化读写，避免并发写入导致数据损坏
- **内存写穿缓存**：写操作先落内存并立即回调、文件异步持久化，读操作内存命中直接返回，消除「写完立即读却读到旧数据」的竞态
- **脉象规则引擎**：六维分类器 → 十四脉（平/浮/沉/迟/数/滑/涩/虚/实/弦/细/洪/缓/结代）加权匹配 → 体质判定 → 五脏评分 → 养生建议
- **六维雷达图**：速率、节律、力度、宽度、紧张度、RSA 六个维度可视化
- **五脏平衡模型**：由六维分值加权得到心/肝/脾/肺/肾五个评分，映射为「和/平/虚/亏」四档状态
- **无 canvas 的图形方案**：静态几何图形用 Node 脚本预渲染 PNG，动态数据多边形用绝对定位圆点阵

## 技术边界

- 当前输入为 `service.health` 提供的心率采样值，不读取原始 PPG 波形。
- RR 间隔由心率采样换算，用于展示性统计，不等同于医疗设备提供的逐搏 RR 间期。
- 「脉象、体质、五脏平衡」等结果来自本地经验规则，不是经过临床验证的诊断结论。
- 参赛版不包含付费激活、体验限制或商业服务端。

## 开发与构建

环境安装参考 [Xiaomi Vela 快应用工具链文档](https://iot.mi.com/vela/quickapp/zh/content/tutorial/toolkit.html)。

```bash
npm install
npm run build
```

开发监听：

```bash
npm run start
```

构建成功后会生成包名为 `com.maixiang.pulse` 的调试 RPK。

## 项目结构

```text
src/
├── app.ux                  # 应用入口
├── manifest.json           # 包名 / 路由 / 权限 / designWidth
├── pages/
│   ├── splash/             # 开屏，分流到引导页或主页
│   ├── oobe/               # 首次使用引导
│   ├── home/               # 主页：状态、入口、雷达图概览
│   ├── measurement/        # 测量页：心率订阅与倒计时
│   ├── dim_showcase/       # 六维指标展示
│   ├── organ_showcase/     # 五脏平衡展示
│   ├── rec_showcase/       # 养生参考
│   ├── pulse_explain/      # 结果解读
│   ├── pulse_theory/       # 脉象科普
│   └── about/              # 关于与免责声明
├── components/
│   ├── radar_chart.ux      # 雷达图组件（纯渲染，父算子渲）
│   └── pulse_wave.ux       # 脉形波组件
├── utils/
│   ├── health.js           # service.health 封装
│   ├── hrv_calc.js         # 统计指标计算
│   ├── pulse_diagnosis.js  # 经验规则引擎
│   ├── pulse_shape.js      # 脉形波点阵生成
│   ├── storage.js          # @system.file 串行队列存储
│   ├── hrv_storage_manager.js  # 按日归档与 14 天保留策略
│   └── strings.js          # 文案字典
└── common/maixiang/        # 背景图、雷达网格、脉形图等资源
```

## 开源与来源

本项目采用 Apache License 2.0。第三方工程结构、素材、AI 生成内容与代码来源说明见 [NOTICE](NOTICE)，开发过程见 [docs/DEV_LOG.md](docs/DEV_LOG.md)，隐私与健康数据处理说明见 [docs/PRIVACY.md](docs/PRIVACY.md)，openvela 平台适配经验见 [docs/SKILL_vela_quickapp.md](docs/SKILL_vela_quickapp.md) 与仓库根目录 `skills/openvela-quickapp-watch-ui/`。

## 免责声明

本应用仅供健康科普、传统文化展示与个人趋势观察。如有身体不适或健康疑虑，请及时咨询具备资质的医疗专业人员。
