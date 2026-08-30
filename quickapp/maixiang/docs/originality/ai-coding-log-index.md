# AI Coding 日志索引

官方要求将受支持工具的 AI Coding 对话归集到参赛专属仓 `logs/`。本文件
只做索引，不代替原始导出。官方当前支持 Claude Code、AIoT-IDE、
OpenCode 和 Codex；其他工具的旧记录只能作为补充过程材料，不能冒充
采集器生成的有效日志。

| 日期范围 | 工具 | 工作内容 | 原始导出路径 | 隐私/密钥检查 | 状态 |
|---|---|---|---|---|---|
| 2026-05-16—2026-06-14 | Claude Code CLI | Zepp OS 可行性、测量链路、算法与 API 复核 | 本机 `~/.claude/history.jsonl` 中的 Maixiang 提示记录，以及 `~/.claude/projects/D--Maixiang/memory/` | 不应直接公开整份全局历史 | 有 65 条用户提示和少量派生 memory；未发现完整会话 transcript |
| 2026-05 起（具体日期以原始记录为准） | Trae | Zepp OS 版本开发 | 本机 Trae 应用数据及可导出的原始会话 | 待检查 | 非官方采集器支持工具，只作补充过程材料 |
| 2026-07-27—2026-07-31 | Codex | Vela 4.0/5.0 调试、页面重构、合规审计与性能优化 | 待导出到 `logs/` | 待检查 | 待导出 |

不得把人工整理的开发总结冒充原始 AI 对话，也不得编辑采集器生成的
`.jsonl`。含敏感内容时应删除整份会话文件。

## 既有日志处理口径

- Claude Code CLI：目前仅确认全局 `history.jsonl` 中有 Maixiang 用户提示，
  项目目录中有少量带会话 ID 的 memory；没有找到完整的模型回答 transcript。
  不得把提示历史或 memory 写成“完整对话”。如后续找到原始 transcript，再进入
  赛事专属 openvela 工作区按官方手册尝试补导；能否计入有效工时，以官方校验
  工具和组委会答复为准。
- Trae：不得转换、仿造为官方 `.jsonl`。可保留原始导出、截图、文件时间和
  对应 Git commit，作为 Zepp OS 版本独立开发的补充证据。
- Zepp OS 是参赛移植版的前置自有项目，其日志用于证明来源演化；参赛阶段仍应
  在专属 openvela 工作区使用官方支持工具形成新的有效日志。

详细盘点、时间线和证据边界见
[`zepp-ai-development-record.md`](./zepp-ai-development-record.md)。
