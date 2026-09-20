# logs/ — AI Coding 日志目录

本目录存放《脉象》开发过程中与 AI 编程工具的对话日志，随作品代码一并提交。

## 目录结构

```text
logs/
└── tiqwq/                                   # 队员 GitHub 用户名
    ├── manifest.json                        # 会话清单（含来源文件 SHA256 完整性记录）
    ├── 2026-07-26/
    │   ├── qoder__fded8287-….jsonl          # 核心开发会话（1537 条事件）
    │   ├── qoder__e1657b7d-….jsonl
    │   └── …
    ├── 2026-07-27/
    │   └── qoder__35e75012-….jsonl          # 界面打磨会话（425 条事件）
    └── 2026-07-28/
        └── …
```

共 **11 个会话 / 2887 条事件**，覆盖 2026-07-26 至 2026-07-28。

## 日志格式

每条事件一行 JSON，字段符合赛事 `schema/event.schema.json`（v1.0）：

```json
{"schema_version":"1.0","session_id":"…","team_id":"contest2026_305_Zerv",
 "github_login":"tiqwq","tool":"qoder","seq":0,"ts":"2026-07-26T07:49:18.4164037Z",
 "role":"user","text":"完整阅读整个项目并且评估移植到vela os的完整性…"}
```

- `seq` 为会话内单调递增序号；
- `role` 为 `user` / `assistant` / `tool`；
- 工具调用事件带 `tool_name` / `tool_call_id` / `input` / `output`。

## 关于 Qoder

本作品使用 **Qoder** 作为 AI 编程工具。Qoder 的会话 transcript 与 Claude Code 同构，其存储位置为：

```text
~/.qoder/projects/<工程目录>/transcript/<会话 ID>.jsonl
```

日志由赛事日志采集器的 Qoder 适配器（`contest-log-collector`，`--source qoder` 回填模式）从上述原始 transcript 转换生成，**未人工修改任何事件内容**。

原始 transcript 的 SHA256 与字节数已记录在 `manifest.json` 的 `source_integrity` 字段中，可用于核验转换前后的对应关系。

## 校验

本目录已通过赛事官方校验工具 `tools/validate-log.py`：

```text
Files checked:  11
Events checked: 2887

✅ ALL OK
```
