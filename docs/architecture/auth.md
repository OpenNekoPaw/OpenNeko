# Auth 横切架构

更新日期：2026-06-15

Auth 是 OpenNeko 的横切认证和凭据边界。它为 Market、Cloud Provider、Agent provider、registry 和未来协作服务提供身份、token、session 和 secret 管理，但不拥有创作领域业务。

## 设计目标

- 将认证、凭据和 token 生命周期从创作包中抽离。
- 区分用户级凭据、workspace 配置和运行时 session。
- 让 Webview 通过 Extension Host 查询认证状态，不直接访问 secret。
- 让 Market、Agent provider 和 cloud service 复用统一认证桥。

## 包边界

| 包                             | 职责                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| `neko-auth/packages/core`      | Auth DTO、session、provider contract、纯逻辑                |
| `neko-auth/packages/extension` | VS Code SecretStorage、commands、auth bridge、token refresh |
| Webview consumers              | 发起 login/logout/status 意图，展示 session 投影            |
| `neko-market`                  | 使用 auth token 访问 registry 和 entitlement                |
| `neko-agent`                   | 使用 provider credential/session 连接模型服务               |

## 配置作用域

| 数据                                   | Scope                    | 原因                                 |
| -------------------------------------- | ------------------------ | ------------------------------------ |
| API key / OAuth token / registry token | User secret              | 属于个人凭据，不写项目               |
| Provider availability                  | User                     | 由个人凭据决定                       |
| MCP server/project tool config         | User + Workspace         | 项目可以声明工具，但凭据仍归用户     |
| Project policy                         | Workspace                | 项目可约束允许的 provider 或市场来源 |
| Runtime session                        | Process / Extension Host | 可刷新、可失效，不持久为项目事实     |

## Webview Bridge

Webview 只通过 host bridge 请求：

```text
auth:getStatus
auth:login
auth:logout
```

Extension Host 返回 session projection。Webview 不读取 SecretStorage，不保存 token，不直接调用 provider credential API。

## 不变量

- 凭据不写入项目文件、`.neko/` 事实文件、domain project format 或 Webview local state。
- Workspace 可以声明 provider/policy 需求，但不能携带个人 secret。
- Auth session 是运行时能力，不是创作事实。
- Market entitlement、registry access 和 paid asset 状态通过 Auth + Market contract 获取，不由创作领域自行实现。
- Agent provider credential 由 Auth/config/provider adapter 解析，不写入 prompt 或 skill 文件。
- 日志、trace 和错误消息不得泄露 token、API key 或 refresh secret。

## 与 Market 和 Agent 的关系

```text
Auth
  -> Market registry token / entitlement
  -> Agent provider credential resolution
  -> Cloud model/media provider session
  -> Webview projected status
```

Auth 只处理身份和凭据，不判断某个素材是否可信、不决定某个 Agent tool 是否可注入，也不拥有模型调用策略。

## 吸收的稳定主题

本设计吸收以下历史主题的稳定部分：

- Configuration scope design 中 provider/model/user credential 规则
- Marketplace registry auth usage
- Agent provider credential scope
- Webview auth bridge pattern
