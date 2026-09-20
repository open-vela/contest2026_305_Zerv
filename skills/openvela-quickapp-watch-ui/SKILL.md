---
name: openvela-quickapp-watch-ui
description: 在 openvela（Xiaomi Vela）快应用上开发圆屏手表界面、图形、传感器与本地存储能力时使用。覆盖无 canvas 环境下的图形替代方案（预渲染位图 / 绝对定位圆点阵 / chart / arc progress）、transform rotate 禁区、样式禁区清单（emoji 无字形、单边 border、装饰图竖向平铺）、@system.file 串行队列与内存写穿缓存、service.health 心率订阅要点，以及 Vela 4.0 引擎 ES5 API 限制导致「整页白屏且无任何报错」的排查路径。适用于：把 Zepp OS 或其他平台的手表应用移植到 openvela、开发雷达图/曲线图/弧形进度、接入 service.health、排查低版本固件白屏或 aiot-toolkit 构建异常。
---

# openvela 快应用手表端图形与 UI 适配

> **来源**：《脉象》项目从 Zepp OS 移植到 openvela 快应用的实战经验。
> 全部结论均在 `vela-miwear-watch-5.0`（openvela AI 硬件开发者大赛）模拟器上实测验证，
> 目标形态为 480×480 圆屏手表。

## 何时使用这份 Skill

出现下列任一情况时，先读本 Skill 再动手：

- 要在 openvela 快应用里画雷达图、曲线、环形进度条、自绘装饰图形；
- 从 Zepp OS / 其他手表平台移植应用到 openvela 快应用；
- 接入 `service.health`（心率 / 血氧 / 压力）采样；
- 在设备本地持久化数据，且遇到「写完马上读却读到旧数据」；
- 页面在低版本（Vela 4.0 量产固件）**整页白屏、且日志里没有任何报错**；
- `aiot-toolkit` 构建报临时镜像目录异常。

## 五条铁律（先记这个，能省几小时）

1. **这个平台没有 canvas。** 自绘图形一律走「静态→预渲染 PNG / 动态→绝对定位圆点阵 / 曲线→chart 组件 / 弧形→progress type="arc"」四条路，不要试图在运行时画布上作画。
2. **任何依赖 `transform: rotate` 的动态图形都不要做。** 该平台 rotate 语义与 CSS 标准不一致且不可预测（详见参考文件）。
3. **Vela 4.0 引擎的 JS 运行时只到 ES5 水平。** `Object.values` / `Object.entries` / `Array.prototype.includes` 这类 ES2016+ API 会导致**模块初始化静默失败 → 整页白屏且无任何报错**。babel 只转语法、不补 API。
4. **存储不要用 `@system.storage`。** 该接口在真机上读写不可靠，而且**模拟器无法复现** —— 同一份代码在官方模拟器上完全正常，只有把编译产物安装到真机（如小米手表系列）才暴露问题。长期数据一律用 `@system.file`，URI 用 `internal://files/`（持久）；`internal://cache` 会被系统回收。
5. **父算子渲。** 子组件 `$watch` 监听 prop 不触发；派生计算放在页面侧算完，子组件只接收最终渲染数据。需要强制刷新子组件几何时，用 `if` 开关先降后升重建实例（`this.ready=false; setTimeout(()=>this.ready=true, 0)`）。

## 快速决策表

| 我要做的东西 | 用什么方案 | 参考 |
|---|---|---|
| 固定几何图形（雷达网格、刻度盘） | Node 脚本预渲染 PNG，改样式重跑脚本 | `scripts/gen_radar_grid.js` |
| 数据多边形 / 虚线 / 折线点位 | 绝对定位小圆点 div，只绑 `left`/`top` | `references/graphics-and-style.md` |
| 波形曲线 | `chart` 组件，一个周期 ≥30 个采样点 | `references/graphics-and-style.md` |
| 环形 / 弧形进度 | `progress type="arc"`，显式声明 `start-angle` / `total-angle` | `references/graphics-and-style.md` |
| 分隔线 | 独立的 1px 高 div | `references/graphics-and-style.md` |
| 图标 | 汉字或 PNG 位图 | `references/graphics-and-style.md` |
| 高频小文件读写 | `@system.file` 串行队列 + 内存写穿缓存 | `references/health-and-storage.md` |
| 心率 / 血氧 / 压力采样 | `@service.health` + manifest 三件套 | `references/health-and-storage.md` |
| 页面白屏且无报错 | ES5 兼容排查路径 | `references/es5-runtime-limits.md` |
| 构建 / 部署 / 调试 | adb 直控流程、临时镜像清理 | `references/build-and-debug.md` |

## 参考文件

- **`references/graphics-and-style.md`** —— 无 canvas 的图形替代方案、`transform` 禁区详解、样式禁区清单（emoji 豆腐块 / 单边 border 画成整圈 / 装饰图竖向平铺露接缝）。
- **`references/es5-runtime-limits.md`** —— Vela 4.0 JS 运行时禁用 API 与 ES5 替代写法对照表，以及「白屏无报错」的高效排查路径。
- **`references/health-and-storage.md`** —— `service.health` 集成要点（manifest 三件套、1Hz 回调、退订、模拟器数据回放）与 `@system.file` 存储最佳实践。
- **`references/build-and-debug.md`** —— aiot-toolkit 构建异常、`.temp_*` 临时镜像、多工程依赖共享、双 watch 任务竞态、adb 直控部署流程。

## 可复用脚本

- **`scripts/gen_radar_grid.js`** —— 零依赖（仅 Node 内置 `zlib`/`fs`/`path`）程序化生成雷达网格 PNG（五边形/六边形）。内置手写 PNG chunk 编码器，2x 超采样抗锯齿，透明底。改几何参数后重跑即可，运行时组件与脚本共享同一套坐标常量。
  用法：`node scripts/gen_radar_grid.js <输出目录>`（缺省输出到当前目录）
  已验证：输出 `radar_grid5.png` 5366 字节 / `radar_grid6.png` 5132 字节，与本项目仓内资源一致。

## 移植检查清单

从 Zepp OS 或其它平台移植手表应用到 openvela 时，按此顺序过一遍：

- [ ] 盘点原平台的 API 依赖（如 `@zos/*`），区分「平台无关算法」与「平台绑定 UI」
- [ ] 算法层尽量平移到 `utils/`，UI 层按 `.ux` MVVM 全部重写
- [ ] manifest 重建：`features` / `permissions` / `router` / `designWidth`
- [ ] 传感器能力确认（如 `service.health`），确认是否有后台采样需求
- [ ] 全站替换 emoji 为汉字或位图
- [ ] 全站替换单边 border 为独立分隔线 div
- [ ] 全站移除对 `transform: rotate` 的依赖
- [ ] grep 一遍 `Object\.(values|entries)|\.includes\(`，替换为 ES5 写法
- [ ] 存储层迁到 `@system.file`，加串行队列与内存缓存
- [ ] 圆屏适配：内容区高度、时钟层、滚动区域、返回重绘
