# Agent 横切架构

更新日期：2026-08-18

本文件定义 OpenNeko Agent 的稳定系统边界。迁移中的实现与验收状态由
`openspec/changes/replace-pi-with-dsh-runtime-atomically/` 管理；目标决策见
[`adr-dsh-cordis-replace-agent-extension-runtime.md`](adr-dsh-cordis-replace-agent-extension-runtime.md)。
历史 [`adr-pi-agent-runtime.md`](adr-pi-agent-runtime.md) 已被该决策取代，不再描述当前 authority。

## 系统定位

DSH 独立子进程/profile 是 Agent、Session/transcript、Inbox/queue、Tool lifecycle、Skill、MCP 与
Plugin 的唯一 runtime authority。OpenNeko 不实例化 Pi Agent/Session，不实现第二套 Agent loop、Skill
Host、MCP manager、Plugin runtime、Tool registry、queue、transcript 或 compaction。

OpenNeko 保留：

- Electron 原生 Session/permission UI 与 Conversation navigation；
- Conversation metadata、Workspace/domain binding 和 exact DSH Session reference；
- credential、sender、path、workspace trust 和 OS/process authority；
- ACP application client、事件 projection 与 DSH reverse Host request adapter；
- Generation、Canvas 等 typed domain Tool contract，以及 owning-domain facts/Jobs；
- extension management 的只读 presentation 与精确命令入口。

## 唯一生产路径

```text
Desktop native Agent surface
  -> sender-bound typed Session / Permission IPC
  -> Desktop DSH Session / Permission Host
  -> package-owned Conversation binding + ACP application/projection
  -> ACP JSON-RPC stdio
  -> independently supervised DSH subprocess/profile
  -> DSH Agent / Session / Tool / Skill / MCP / Plugin authority
```

生产路径不得使用内嵌 Cordis、DSH Web/Client Runtime、TypeScript SDK、Remote API、系统 Node、全局
DSH、Electron `process.execPath` 或 Pi fallback。DSH runtime closure 必须随产品精确锁定；`scripts/dsh-q0`
只用于非发布资格验证，不进入发布包。

## 五层边界

| 维度 | 约束 |
| --- | --- |
| 职责 | DSH 拥有 Agent/Session/extension execution；OpenNeko Agent application 拥有 binding/projection；领域包拥有业务结果；Host 拥有信任和资源。 |
| 依赖 | Renderer 只依赖 typed contracts；Desktop Main 只组合 package public ports 与 concrete adapters；host-neutral packages 不依赖 Electron/React。 |
| 接口 | 使用 exact Conversation/DSH Session/turn/call/request/Job identity 与单一 canonical shape；禁止自由 JSON、内部版本和 active-state fallback。 |
| 扩展 | Skill/MCP/Plugin 只进入官方 DSH profile；领域能力以官方 typed DSH Tool 经 reverse Host request 调用 owning service。 |
| 测试 | deterministic tests 证明唯一 path/no-fallback；真实 Desktop + provider 验证行为；二者不能互相替代。 |

## Session 与产品事实

DSH Session 保存 harness transcript、model context、turn/call lineage、Inbox/queue 与 qualified compaction。
OpenNeko catalog 只保存用户可管理的 Conversation metadata、Workspace/domain binding、DSH Session
reference、权限/信任和领域 artifact/Job reference；不得复制完整 transcript 或把 projection 变成第二事实源。

Session 不可解析、binding 丢失或 DSH 不可用时，只将对应 Conversation 标记为不可执行并显示明确
diagnostic。不得创建空 Session、回退旧 reader、覆盖用户数据、停止 sibling Conversation，或让局部错误
导致应用启动失败。旧 Pi 数据保持原始字节，只有用户显式删除或独立设计的恢复流程可以改变它。

## Tool 与领域 Job

DSH 拥有 Tool call lifecycle。Generation、Canvas、Cut、Assets、Character、World 等 owning packages
继续拥有 schema、semantic validation、authorization、事务、事实和 durable Job。领域 Tool 不用 MCP
包装；DSH plugin 只注册精确 Tool 并通过 typed reverse request 委托 Host adapter。

```text
DSH Tool call identity
  -> bounded reverse Host request
  -> exact Conversation/domain authorization
  -> owning-domain application service
  -> typed result or durable Job identity
```

Tool cancel 只结算当前 call；已发布领域 Job 的取消遵循 owning domain contract。非法参数、缺失 handler、
cross-session identity、过大 payload 或权限拒绝必须 fail-local、fail-visible，不能改写为 assistant 成功文本。

## Skill、MCP 与 Plugin

- Skill discovery/read/injection 由 DSH Skill runtime 拥有；Skill content 不承载工具协议。
- MCP configuration/connection/tool exposure 由 DSH profile 拥有；OpenNeko 不维护 MCP client/manager。
- Plugin discovery/load/enablement 由精确锁定的官方 DSH profile 拥有；首版不加载第三方 runtime/Webview JS。
- OpenNeko extension management 只消费 DSH inventory/readiness/config/diagnostics projection 并提交精确命令，不建立第二 catalog/config authority。

## Credential 与安全

Host 是 provider credential authority。Secret 只能通过 Desktop SecretStorage concrete adapter 和受限 Host
port 解析，不能进入 ACP logs/stdout、DSH Session、Renderer、Evaluation facts 或 domain artifacts。Renderer
不得访问 Node/Electron、本地绝对路径、raw cache path、credential 或进程 handle。

ACP stdout 必须保持协议纯净；日志走 stderr 或受控 diagnostic。reverse request、permission 与资源授权必须
绑定完整 sender/Conversation/DSH Session/turn/call identity，并只接受 DSH 当前广告的 option/operation。

## Prompt 与 Capability

System Prompt 只负责通用行为、安全、工具发现与失败处理。领域 operation/schema/validation/diagnostic 由
owning capability/Tool contract 注入；Skill 只负责方法论和创作语义。Prompt/Skill 不得补偿 runtime、Tool、
provider、permission 或 artifact owner 的缺陷。

## Renderer 与生命周期

Desktop 原生 Agent surface 只选择并渲染 DSH-derived projection；卸载 UI 或切换 Scene 不得取消仍在运行、
排队或等待审批的 exact Session task。Extension Management browser presentation 不拥有 Agent controller、
transcript、queue、Skill/MCP/Plugin runtime 或 Host IO。

## 验收

确定性门禁至少覆盖 ACP purity、subprocess lifecycle、exact binding、Session replay、permission/cancel、reverse
Tool request、bounded payload、迟到 frame 隔离、唯一 registration 与 retired-path poison。`pnpm test:agent:eval`
只证明 key-free harness/schema readiness；真实行为必须通过完整 Desktop session owner、用户可操作 UI 和真实
provider 验证，并记录 effective model、terminal state、artifact/path evidence 与 no-fallback facts。

发布前必须证明旧 Pi runtime、Webview message protocol、queue/confirmation、Skill Host、MCP Manager、Plugin
runtime 与平行 client 路径均不可达；真实 provider/API 或可见 UI 验收未执行时，发布门禁保持关闭。
