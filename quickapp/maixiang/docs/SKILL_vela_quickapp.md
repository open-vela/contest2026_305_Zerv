# Skill 索引：openvela 快应用手表端图形与 UI 适配

本文件已迁移为**索引**，正文内容统一维护在仓库根目录的标准 Skill 中，避免两处分叉。

## 正式位置

```
skills/openvela-quickapp-watch-ui/
├── SKILL.md                              Skill 入口（含 name / description 触发说明）
├── references/
│   ├── graphics-and-style.md             图形方案与样式禁区
│   ├── es5-runtime-limits.md             低版本运行时 ES5 限制与白屏排查
│   ├── health-and-storage.md             service.health 与 @system.file 集成
│   └── build-and-debug.md                构建、调试与真机部署
└── scripts/
    └── gen_radar_grid.js                 雷达网格 PNG 生成脚本（零依赖）
```

## 覆盖内容

| 主题 | 位置 |
|---|---|
| 无 canvas 的图形替代方案（预渲染 PNG / 圆点阵 / chart / arc） | `references/graphics-and-style.md` |
| `transform` 禁区与圆屏布局规则 | `references/graphics-and-style.md` |
| 父算子渲模式与组件刷新 | `references/graphics-and-style.md` |
| ES2016+ API 禁用清单与 ES5 替代写法 | `references/es5-runtime-limits.md` |
| 整页白屏的排查路径 | `references/es5-runtime-limits.md` |
| `service.health` 接入三件套与采样约束 | `references/health-and-storage.md` |
| `@system.file` 串行队列与写穿缓存 | `references/health-and-storage.md` |
| 模拟器 vs 真机差异 | `references/health-and-storage.md` |
| 构建异常、双任务竞态、adb 直控 | `references/build-and-debug.md` |
| 雷达网格生成脚本用法 | `scripts/gen_radar_grid.js` |

## 适用场景

任何把 Zepp OS 或其他平台的手表应用移植到 openvela 快应用的项目，都可直接套用该 Skill 的移植检查清单与 ES5 API 对照表。
