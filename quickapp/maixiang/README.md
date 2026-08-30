# 脉象（MaiXiang）openvela 版

《脉象》是面向 openvela 智能手表的健康观察与传统脉学科普快应用，也是「2026 首届 openvela AI 硬件开发者大赛」参赛项目。

应用读取设备健康服务提供的心率采样，在设备端进行统计和经验规则分析，以脉象、六维指标、体质与五脏平衡趋势等形式呈现结果。相关结果仅用于健康科普和个人观察，不构成医疗诊断，也不能替代专业医疗建议。

## 项目特点

- openvela 圆屏快应用原生界面
- 设备端心率采样、规则分析与文件持久化
- 六维脉象与五脏平衡雷达图
- 脉象科普、结果解读与养生参考
- 从团队自有 Zepp OS 版本迁移并针对 openvela 重写界面和平台接口
- 使用 AI Coding 辅助迁移、重构、调试和文档整理

## 技术亮点

- **串行队列存储**：基于 Promise 链的文件 I/O 队列，避免并发写入导致数据损坏
- **结构化错误处理**：所有存储操作返回 `(error, value)` 元组，调用方可区分网络异常、配额超限等场景
- **脉象诊断引擎**：24 节气时间加权 + 滑动窗口统计，支持平脉/浮脉/沉脉/迟脉/数脉五类基础脉象识别
- **六维雷达图**：深度、速率、节律、力度、宽度、稳定性六维脉象可视化
- **五脏平衡模型**：基于脉象特征的肝/心/脾/肺/肾五行属性映射与平衡分析
## 技术边界

- 当前输入为 `service.health` 提供的心率采样值，不读取原始 PPG 波形。
- RR 间隔由心率采样换算，用于展示性统计，不等同于医疗设备提供的逐搏 RR 间期。
- “脉象、体质、五脏平衡”等结果来自本地经验规则，不是经过临床验证的诊断结论。
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

## 项目结构

```
src/
├── app.ux              # 应用入口
├── pages/
│   ├── home/           # 首页：快速测量入口
│   ├── measurement/    # 测量页：心率采集与实时展示
│   ├── result/         # 结果页：脉象诊断与六维雷达图
│   ├── history/        # 历史记录列表
│   ├── record_detail/  # 单条记录详情
│   ├── pulse_tutorial/ # 脉象科普教程
│   ├── organ_showcase/ # 五脏平衡展示
│   ├── dim_showcase/   # 六维指标展示
│   └── settings/       # 设置页
├── components/
│   ├── radar_chart.ux  # 雷达图组件
│   └── ...
└── utils/
    ├── storage.js            # 串行队列存储引擎
    ├── hrv_storage_manager.js # HRV 数据管理
    ├── pulse_diagnosis.js    # 脉象诊断算法
    ├── pulse_utils.js        # 脉象工具函数
    ├── strings.js            # 文案常量
└── ...
```
## 开源与来源

本项目采用 Apache License 2.0。第三方工程结构、素材、AI 生成内容与代码来源说明见 [NOTICE](NOTICE)，开发过程见 [docs/DEV_LOG.md](docs/DEV_LOG.md)，原创性、相关工作和算法边界见 [docs/originality](docs/originality/)。

## 免责声明

本应用仅供健康科普、传统文化展示与个人趋势观察。如有身体不适或健康疑虑，请及时咨询具备资质的医疗专业人员。
