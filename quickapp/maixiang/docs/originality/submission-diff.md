# 参赛版隔离与提交差异

## 版本边界

| 版本 | 位置 | 用途 | 服务端/激活 |
|---|---|---|---|
| openvela 参赛版 | `D:\MaiXiang_Vela\MaiXiang` | 大赛开源交付 | 不包含付费激活、体验限制、OVAM 或商业服务端 |
| Vela 4.0 商业适配版 | `D:\MaiXiang_Vela\MaiXiang_ordinaryWatch` | 商业验证与旧系统适配 | 可能包含 OVAM；不得混入参赛仓 |
| Zepp OS 原型 | `D:\Maixiang` | 同团队早期版本 | 与参赛版分别维护 |

## 当前自动扫描范围

提交前应在参赛仓源码、文档和配置中扫描：

- `activation_status`、`experience_mode`、付费、激活；
- `OVAM`、商业 API 地址、`fetch(`；
- API key、token、私钥和证书；
- “首创”“行业空白”“端侧 AI 诊断”等绝对化宣传。

## 官方仓库流程

参赛阶段应将工程放入组委会创建的 `contest2026_<编号>_<队伍名>` 专属仓子目录，通过 fork → PR → 自行 review 合入。获奖后才向 openvela 上游的 `dev-ai-contest-2026` 分支提 PR。

专属仓地址、PR 和最终 commit：`待收到/确认后填写`。
