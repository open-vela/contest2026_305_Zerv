# Skill 沉淀：openvela 快应用手表端图形与 UI 适配技巧集

> 来源：《脉象》项目从 Zepp OS 移植到 openvela 快应用的实战经验，
> 全部结论在 vela-miwear-watch-5.0（开发者大赛）模拟器实测验证。

## 一、无 Canvas 的图形替代方案

openvela 快应用组件集无 canvas。自绘图形按"静态/动态"拆分处理：

1. **静态图形 → 预渲染 PNG**
   雷达网格等固定几何图形，用 Node 脚本程序化生成 PNG 资源
   （2x 超采样抗锯齿，zlib + 手写 PNG chunk 编码器即可，零依赖）。
   改样式重跑脚本，几何参数与运行时组件共享一套常量。
2. **动态图形 → 绝对定位圆点阵**
   数据多边形/虚线：沿线段等距铺小圆点 div（仅用 left/top 定位），
   顶点加大号圆点。left/top/width/background-color 的内联绑定 100% 可靠。
3. **曲线图 → chart 组件**
   折线数据密度决定平滑度（一个正弦周期至少 30+ 采样点）；
   axes display:false 即为纯波形卡片。
4. **弧形进度 → progress type="arc"**
   start-angle/total-angle 显式声明（默认 240° 扇形不是整圆）；
   顶弧样式用 start-angle="-70" total-angle="140"。

## 二、transform 禁区（重要）

该平台 rotate 语义与 CSS 标准不一致且不可预测，实测三个坑：
- 内联 style 绑定的 transform 不生效（其他属性绑定正常）；
- 默认 transform-origin 不可靠；
- rotate 正角方向为逆时针（与 CSS 顺时针相反）。

**结论：任何依赖 rotate 的动态图形都不要做**，一律走预渲染位图
或圆点阵方案；静态装饰性旋转如需使用，必须显式 transform-origin
并在真机/模拟器实测方向。

## 三、数据流与组件模式

1. **子组件 $watch 监听 prop 不触发** → "父算子渲"：派生计算放在
   页面侧，子组件只接收最终渲染数据的 prop（模板对 prop 的响应式
   刷新可靠）。
2. **需要强制刷新子组件几何**时，用 if 开关先降后升重建实例
   （`this.ready=false; setTimeout(()=>this.ready=true, 0)`）。

## 四、样式禁区清单

| 禁区 | 症状 | 替代 |
|---|---|---|
| emoji 字符 | 渲染为豆腐块（字库无字形） | 汉字或 PNG 图标 |
| 单边 border（border-bottom 等） | 画成四边整圈 | 独立分隔线 div |
| 内联绑定 transform | 静默失效 | 静态类 / 弃用 rotate |
| 装饰边框图竖向平铺 | 露接缝与边框色差 | stack 固定底图 + scroll 上层滚动 |

## 五、存储最佳实践（@system.file）

- URI 用 `internal://files/`（持久）；`internal://cache` 会被系统回收，
  长期数据勿放。
- **内存写穿缓存**：写先落内存立即回调、文件异步持久化；读内存
  命中直返——消除"写后立读"竞态并提速高频小文件读写。
- 官方要求小内存设备及时清理文件：按日分文件的数据要做保留策略
  （如仅留最近 14 天并同步裁剪索引）。

## 六、service.health 集成要点

- manifest 三件套缺一不可：features `service.health` +
  permissions `hapjs.permission.HEALTH` + （后台采集时）
  config.background.features。
- HEART_RATE 1Hz 逐秒回调 `{timeStamp, value}`，等价于逐拍 BPM 流，
  可由 BPM 换算“估算间期”用于展示性波动统计，但这不是逐搏测得的
  RR 间期，不能表述为临床 HRV；冷启动先 getRecentSamples 补一帧避免
  首屏空白。
- 大赛模拟器镜像内置 31 天真人数据回放（HR 48~182 循环），
  无真机传感器也可全链路演示。
- 页面退出务必 unsubscribeSample，防止后台空耗。

## 七、构建与调试

- aiot-toolkit 构建异常提示 `.temp_*/src/manifest.json 不存在`时，
  删除项目同级的 `.temp_<项目名>` 临时镜像目录重跑即可（纯缓存）。
- 多工程共存时 node_modules 可用目录联接（Junction）共享，
  工具链版本天然一致。
- IDE watch 任务只能存在一个：日志中出现两份相同的 `start build`
  即为双任务竞态（产物损坏/模拟器反复 reboot），全部停止后重跑。
- adb 直控流程（绕开 IDE 竞态）：
  `~/.vela/sdk/tools/adb/win/adb.exe` → push RPK →
  `shell unzip -o ... -d /data/quickapp/app/<包名>` →
  `shell vapp app/<包名>`（前台阻塞，杀 shell 即杀应用）；
  运行时日志看 `shell dmesg`（AIOTJS framework trace）。

## 八、低版本（4.0 量产固件）JS 运行时限制（重要）

4.0 引擎 JS 运行时 API 只到 ES5 水平；babel 只转语法、不补 API，
使用高版本 API 会导致**模块初始化静默失败 → 整页白屏且无任何报错**
（dmesg 里 JS 无异常，页面 PageCreate 正常，就是不上屏）。

禁用 API 与替代写法：

| 禁用（ES2016+ API） | 替代（ES5） |
| --- | --- |
| `Object.values(o)` | `Object.keys(o).map(k => o[k])` |
| `Object.entries(o)` | `Object.keys(o)` 遍历取 `o[k]` |
| `arr.includes(x)` | `arr.indexOf(x) !== -1` |
| `Math.max(...arr)` | `Math.max.apply(null, arr)` |

实测可用：`padStart`（该镜像有）、箭头函数/解构/模板字符串（babel 转语法）、
`position: absolute`（正常）、chart/progress/image/router.push（正常）。

排查此类白屏的高效路径：零依赖探针页做入口 → 确认框架正常 →
可疑页面砍成骨架模板+裸 script → 逐步加回 import，
一次即可锁定有毒模块；再对该模块 grep `Object\.(values|entries)|includes\(`。

另：chart 组件 `datasets` 首帧不要给空数组（异步数据就绪前先给一条平线），
低版本渲染器对空数据集处理不稳。
