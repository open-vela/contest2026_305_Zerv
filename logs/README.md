# logs/ — AI Coding 日志目录

本目录存放《脉象》开发过程中与 AI 编程工具的对话日志，随作品代码一并提交。

## 目录结构

```text
logs/
└── tiqwq/                                   # 队员 GitHub 用户名
    ├── fded8287-0ac6-4507-9da9-e1e795820a42.jsonl
    └── 35e75012-78d5-45ea-9548-dc5b2711a53e.jsonl
```

## 关于日志格式的说明

本作品的开发使用 **Qoder** 作为 AI 编程工具。Qoder 不在赛事采集器的支持列表内（官方支持 Claude Code / AIoT-IDE / OpenCode / Codex），其会话数据经加密后无法按官方 `.jsonl` 事件格式导出。

经组委会同意，本目录提交的是 **Qoder 本地保存的原始会话记录（transcript）**，**原样复制、未作任何修改**：

- 每个文件对应一次完整会话，文件名为会话 ID；
- 每行一个 JSON 对象，字段为 Qoder 原生格式（`type` / `sessionId` / `uuid` / `timestamp` / `cwd` / `message`），
  与官方 `event.schema.json` 的字段命名不同，其中 `message.content` 的块类型
  （`text` / `thinking` / `tool_use` / `tool_result`）与 Claude Code transcript 同构；
- 日志正文（用户提问与 AI 回复）为明文，可逐条核验；
- 未删除、未改写、未补齐任何事件，也未生成官方格式的 `seq` / `schema_version` 等字段。

## 两次会话

| 文件 | 起始时间 | 时长 | 内容 |
|---|---|---|---|
| `fded8287-…jsonl` | 2026-07-26 | 约 11 小时 | 通读 Zepp OS 原版工程 → 评估移植 openvela 完整性 → 完成 Vela 快应用全部页面与算法层的编写 |
| `35e75012-…jsonl` | 2026-07-28 | 约 13 小时 | 雷达图渲染修复与界面细节打磨 |

## 原始来源

Qoder 会话记录存放于本机 `~/.qoder/projects/<工程目录>/transcript/<会话 ID>.jsonl`，本目录中的文件即从该位置复制而来。
