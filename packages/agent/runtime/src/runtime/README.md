# Agent Runtime Boundary

`runtime/` 只包含 OpenNeko 保留的 host-neutral product adapters。DSH 独立子进程拥有
Agent loop、Session/transcript、Inbox、Tool lifecycle、Skill、MCP 与 Plugin runtime；OpenNeko
不得在本目录重建这些 authority。

系统边界见：

- [`docs/architecture/agent.md`](../../../../docs/architecture/agent.md)
- [`docs/architecture/adr-dsh-cordis-replace-agent-extension-runtime.md`](../../../../docs/architecture/adr-dsh-cordis-replace-agent-extension-runtime.md)

## 保留职责

- `turn/`：仍由产品直接使用的内容、上下文、产物和多模态纯适配器；不得执行主模型 turn。
- `capability/`：Host content access 等真实边界 adapter；不得成为 Tool registry。
- runtime root：仅保留小型 host-neutral collaborators 与公共导出。

ACP client、Conversation-to-DSH Session binding、Session catalog、事件 projection、permission owner 和
DSH domain Tool adapters 位于相邻 `acp/` 与 `application/` owner，不通过本目录建立第二通信路径。

## Authority

| Concern                                                     | Canonical owner                                 |
| ----------------------------------------------------------- | ----------------------------------------------- |
| Agent execution、Session、transcript、Inbox、Tool lifecycle | DSH subprocess/profile                          |
| Skill、MCP、Plugin discovery/load/execute                   | DSH subprocess/profile                          |
| Conversation metadata 与 exact DSH Session binding          | OpenNeko Agent application + LocalMetadata      |
| ACP replay/event 的 bounded projection                      | `@neko/agent-runtime` ACP/application           |
| Workspace trust、credential、process、sender authorization  | Desktop Main / Host                             |
| Generation、Canvas 等 schema、validation、facts、Job        | owning domain package                           |
| Skill/MCP management presentation                           | `@neko/agent-webview/extension-management/root` |

## 禁止路径

- Pi Agent/Session/Skill/Tool runtime、OpenNeko queue、custom transcript/history/compaction；
- Webview message controller、`confirmTool`、active/current/recent identity fallback；
- 内嵌 Cordis、DSH Web/Client Runtime、TS SDK 或 Remote API production path；
- generic Tool/MCP/Plugin registry、wildcard handler、try-next 或 provider fallback；
- 为缺失实现返回空数据、no-op 或兼容成功。

DSH/ACP 不可用或 contract 非法时，应只拒绝当前 request/session 并返回明确 diagnostic；不得切换
到旧 runtime。旧 Pi 用户数据保持原字节，只能显示局部 unavailable，不能自动读取、迁移或修复。

## Identity

Conversation、DSH Session、turn、Tool call 与领域 Job identity 必须精确关联，不能从 Window、active
Workspace 或 recent Conversation 推断。领域 Job 由 owning domain 独立持久化；Tool call 只记录精确引用。

## 验证

修改本边界至少运行 runtime typecheck/test、Agent/package/application boundary gates 与内部版本/多路径
扫描。涉及真实 Agent behavior 时，按 Evaluation 平台记录 canonical path、forbidden fallback 和真实
Desktop/provider 证据；key-free 测试不等于行为验收。
