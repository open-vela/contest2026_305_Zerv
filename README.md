# 脉象（MaiXiang）

## 一、作品简介

《脉象》是面向 openvela 智能手表的健康观察与传统脉学科普快应用，属于 2026 首届 openvela AI 硬件开发者大赛的“快应用 / 手表应用创新”方向。

应用通过 `service.health` 获取设备心率采样，在设备端完成数据质量过滤、展示性统计和本地经验规则分析，并以脉象、体质倾向、六维指标、五脏平衡趋势和生活方式参考等形式呈现结果。应用不依赖服务端，不包含付费激活或体验次数限制。

## 二、选题方向

**快应用 / 手表应用创新。**

项目围绕圆屏手表的短时健康观察场景设计，使用 openvela 快应用框架、健康服务、文件服务和圆屏组件完成采集、分析、持久化与展示闭环。

## 三、功能与亮点

- 使用 `service.health` 获取最近心率并订阅实时心率样本。
- 设备端完成 BPM 有效性检查、中位数窗口过滤、质量分级和统计计算。
- 本地规则引擎输出 14 类基础脉象、六维指标、体质倾向、五脏平衡趋势和养生参考。
- 基于 `@system.file` 的逐文件串行 I/O 队列和内存缓存，降低并发写入及写后读竞态风险。
- 历史数据按日归档，最多保留 14 天，适配小内存设备。
- 针对 480×480 圆屏重写界面，使用预渲染位图、圆点阵和 arc progress 规避平台图形限制。

## 四、目录结构

- `quickapp/maixiang/`：完整《脉象》QuickApp 工程。
- `quickapp/maixiang/src/pages/`：开屏、首次引导、主页、测量和专题展示页面。
- `quickapp/maixiang/src/components/`：脉形图和雷达图组件。
- `quickapp/maixiang/src/utils/`：健康接口、统计计算、诊断规则和文件存储模块。
- `quickapp/maixiang/docs/`：开发日志、隐私说明与 openvela 平台适配经验索引。
- `skills/openvela-quickapp-watch-ui/`：沉淀的 Agent Skill（openvela 快应用手表端图形与 UI 适配）。
- `logs/`：AI Coding 会话日志（Qoder 原始记录）。
- `contest2026_305_Zerv.xml`：将 QuickApp 映射到 openvela 工程的 repo manifest。

## 五、运行方式

### 1. 独立构建 QuickApp

```bash
cd quickapp/maixiang
npm install
npm run build
```

构建成功后会生成包名为 `com.maixiang.pulse` 的调试 RPK；开发监听可运行：

```bash
npm run start
```

### 2. 拉取完整 openvela 工作区

```bash
repo init -u https://github.com/open-vela/contest2026_305_Zerv \
  -b dev-ai-contest-2026 -m contest2026_305_Zerv.xml
repo sync -c -j8
```

manifest 会将 `quickapp/maixiang` 映射到 `packages/apps/contest2026_305_maixiang`。构建和部署请遵循官方快应用教程；初赛阶段建议使用 openvela 模拟器完成开发和验证。

## 六、核心数据流程

```text
service.health 心率样本
  -> BPM 合法性检查与去重
  -> BPM 换算估算 RR
  -> 统计指标与数据质量
  -> 本地经验规则分析
  -> 文件持久化
  -> 首页、雷达图和专题页展示
```

## 七、AI Coding 使用说明

AI 辅助参与了需求拆解、Zepp OS 到 openvela 的平台差异评估、QuickApp 页面迁移、健康接口接入、圆屏 UI 适配、存储竞态排查、兼容性检查、测试验证和文档整理。功能取舍、平台验证、结果审核和提交由开发者完成。

使用的 AI 编程工具为 **Qoder**。由于 Qoder 不在赛事采集器的支持列表内，且其会话导出为加密数据，经组委会同意，本仓库 `logs/` 目录提交的是 Qoder 本地保存的**原始会话记录（transcript）**，原样复制、未作任何修改；格式说明见 `logs/README.md`。

## 八、已知限制与真实性声明

- 输入来自 `service.health` 的心率采样，不读取原始 PPG 波形。
- RR 间隔由低频 BPM 样本换算，仅用于展示性波动统计，不等同于医疗设备提供的逐搏 RR 间期。
- SDNN、LF/VLF RMS、RSA 等结果是基于当前采样能力的近似统计，不是临床 HRV 检测结果。
- 脉象、体质和五脏平衡结果由本地经验阈值规则生成，没有机器学习模型或远程 AI 推理。
- 当前没有历史记录浏览页面，底层文件只用于最近结果加载和最多 14 天的数据保留。
- 测量固定持续 180 秒；短时数据中断会提示等待，但不会暂停倒计时。
- 模拟器提供的是平台内置健康数据回放，不代表当前佩戴者的实时生理数据。
- 本作品仅用于健康科普和个人趋势观察，不构成医疗诊断、治疗或用药建议。

## 九、提交要求核对

- 官方仓库：<https://github.com/open-vela/contest2026_305_Zerv>
- 目标分支：`dev-ai-contest-2026`
- 代码只放在本队仓库的 `quickapp/maixiang/` 内，不修改 openvela 公共仓。
- 代码提交通过 fork、Pull Request 和最终 merge 完成。
- 提交 PR 前，使用报名时的 GitHub 账号签署 openvela CLA。
- AI Coding 日志存放在 `logs/tiqwq/`；Agent Skill 存放在 `skills/openvela-quickapp-watch-ui/`。
- 作品介绍、演示视频和仓库地址按赛事表单要求提交；截止时间以官方公告为准。

## 十、许可与来源

项目采用 Apache License 2.0。第三方来源、素材说明和迁移背景见 `quickapp/maixiang/NOTICE`；开发记录与隐私说明见 `quickapp/maixiang/docs/`；openvela 平台适配经验见 `skills/openvela-quickapp-watch-ui/`。
