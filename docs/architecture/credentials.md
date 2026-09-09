# 凭据与认证边界

当前宿主：Electron Desktop

当前 workspace 不包含独立 Auth 产品或 `neko-auth` 包。认证仍是外部 AI/provider、MCP 和未来联网能力的真实安全边界，但由具体宿主的 credential/config adapter 负责，不通过一个不存在的共享产品兜底。

## 设计目标

- 个人 secret 与 workspace/project 事实严格分离。
- host-neutral runtime 只依赖最小 credential port，不依赖 Electron API 或 UI。
- Desktop renderer 只接收最小状态投影，不读取、保存或转发 token。
- 缺失、失效或不匹配的凭据明确失败，并提供脱敏 diagnostic。

## 当前 owner

| 边界                      | Owner                             | 约束                                                                      |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| Provider API Key          | `@neko/host` 用户配置与凭据 owner | 唯一保存在 `~/.neko/config.toml`，Host 解析；状态投影不含密钥             |
| Agent provider credential | Agent platform/provider adapter   | 仅在精确 Provider 执行边界消费；prompt、Skill 和 transcript 不保存 secret |
| MCP/project tool policy   | workspace config + host policy    | workspace 可声明允许项或引用，但个人凭据仍归用户 scope                    |
| 运行时 session            | owning process/session            | 可刷新、可取消、可失效；不是持久创作事实                                  |

Provider 编辑入口必须告知 API Key 以明文保存在本地用户配置。Provider 元数据与提交的 API Key
由配置 owner 原子写入，文件仅当前用户可读写；省略 Key 保留现有声明，显式提交才替换，删除
Provider 同时移除其配置凭据。设置展示只消费 configured/missing/invalid 状态，已保存的 Key 不返回
Renderer。读取配置不修改其内容或权限；权限限制仅在产品写入时应用。

凭据读取始终使用精确 Provider 在用户配置中的声明。缺失或非法声明在对应 Provider 报错并保留
编辑入口，无关 Provider 保持可用。正常运行不访问其他凭据 authority，不导入、删除或改写无 owner
的本地文件。

不存在一个通用 `auth:*` renderer 命令面。需要登录或授权体验的保留功能应在 owning package 定义最小 typed intent/status contract，并由 Desktop Main adapter 实现；不得把 provider token 作为 IPC payload 返回。

## Scope 不变量

| 数据                                          | Scope               |
| --------------------------------------------- | ------------------- |
| API key、OAuth/refresh token、provider secret | User secret         |
| Provider 可用性和个人默认模型                 | User                |
| 项目允许的 provider/tool policy               | Workspace           |
| 运行时 credential/session handle              | Process/session     |
| 创作结果、provenance 和非敏感 provider 标识   | Project/domain fact |

- Secret 不写入项目文件、`.neko/` 事实、cache、renderer state、prompt、Skill、日志或测试 fixture。
- Workspace 可以限制 provider/tool，但不能携带个人 token。
- 错误、trace 和 telemetry 只记录 provider、scope、错误类别和 correlation id 等脱敏信息。
- External provider 是可恢复边界，可以报告未认证、过期、拒绝或网络失败；不得把失败伪装为原操作成功。
- Credential 和认证能力不得通过 alias、fallback 或成功 no-op 绕过 canonical owner。

## 测试要求

- host adapter 测试覆盖 credential 缺失、失效、取消和 redaction；
- Agent/provider 测试证明 prompt、Skill、transcript 与日志不含 secret；
- Desktop IPC producer/consumer 测试证明状态 projection 不包含 token 或 host credential handle；
- fixture 只能使用合成凭据，不能采集开发机真实配置。
