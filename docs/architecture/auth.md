# 凭据与认证边界

状态：Accepted

更新日期：2026-07-17
对应变更：`align-pruned-workspace-build`

当前 workspace 不包含独立 Auth 产品或 `neko-auth` 包。认证仍是外部 AI/provider、MCP 和未来联网能力的真实安全边界，但由具体宿主的 credential/config adapter 负责，不通过一个不存在的共享产品兜底。

## 设计目标

- 个人 secret 与 workspace/project 事实严格分离。
- host-neutral runtime 只依赖最小 credential port，不依赖 VS Code SecretStorage 或 UI。
- Webview 只接收最小状态投影，不读取、保存或转发 token。
- 缺失、失效或不匹配的凭据明确失败，并提供脱敏 diagnostic。

## 当前 owner

| 边界 | Owner | 约束 |
| --- | --- | --- |
| VS Code 用户凭据 | owning Extension 的 host adapter | 使用 VS Code SecretStorage/config；不得传入 Webview 或项目文件 |
| TUI 用户凭据 | `apps/neko-tui` 的 Node host composition | 从明确用户配置/环境 adapter 解析；不得写入 workspace 事实 |
| Agent provider credential | Agent platform/provider adapter | runtime 只消费解析后的能力；prompt、Skill 和 session transcript 不保存 secret |
| MCP/project tool policy | workspace config + host policy | workspace 可声明允许项或引用，但个人凭据仍归用户 scope |
| 运行时 session | owning process/session | 可刷新、可取消、可失效；不是持久创作事实 |

不存在一个通用 `auth:*` Webview 命令面。需要登录或授权体验的保留功能应在 owning package 定义最小 typed intent/status contract，并由对应 host adapter 实现；不得把 provider token 作为消息 payload 返回。

## Scope 不变量

| 数据 | Scope |
| --- | --- |
| API key、OAuth/refresh token、provider secret | User secret |
| Provider 可用性和个人默认模型 | User |
| 项目允许的 provider/tool policy | Workspace |
| 运行时 credential/session handle | Process/session |
| 创作结果、provenance 和非敏感 provider 标识 | Project/domain fact |

- Secret 不写入项目文件、`.neko/` 事实、cache、Webview state、prompt、Skill、日志或测试 fixture。
- Workspace 可以限制 provider/tool，但不能携带个人 token。
- 错误、trace 和 telemetry 只记录 provider、scope、错误类别和 correlation id 等脱敏信息。
- External provider 是可恢复边界，可以报告未认证、过期、拒绝或网络失败；不得把失败伪装为原操作成功。
- 已移除的 Auth/Market package、session DTO 或命令入口不得以 alias、fallback 或成功 no-op 恢复。

## 测试要求

- host adapter 测试覆盖 credential 缺失、失效、取消和 redaction；
- Agent/provider 测试证明 prompt、Skill、transcript 与日志不含 secret；
- Webview protocol 测试证明状态 projection 不包含 token 或 host credential handle；
- fixture 只能使用合成凭据，不能采集开发机真实配置。
