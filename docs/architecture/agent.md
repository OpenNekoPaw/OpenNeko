# Agent 横切架构

更新日期：2026-08-25

本文件定义 OpenNeko Agent 的稳定系统边界。迁移中的实现与验收状态由
`openspec/changes/replace-pi-with-dsh-runtime-atomically/` 管理；目标决策见
[`adr-dsh-cordis-replace-agent-extension-runtime.md`](adr-dsh-cordis-replace-agent-extension-runtime.md)。

## 系统定位

DSH 独立子进程/profile 是 Agent、Session/transcript、Inbox/queue、Tool lifecycle、Skill、MCP 与内部
Plugin composition 的唯一 runtime authority。OpenNeko 不实例化 Pi Agent/Session，不实现第二套 Agent loop、Skill
Host、MCP manager、Plugin runtime、Tool registry、queue、transcript 或 compaction。

OpenNeko 保留：

- Electron 原生 Session/permission UI 与 Conversation navigation；
- Conversation metadata、Workspace/domain binding 和 exact DSH Session reference；
- credential、sender、path、workspace trust 和 OS/process authority；
- ACP application client、事件 projection 与 DSH reverse Host request adapter；
- Generation、Canvas 等 typed domain Tool contract，以及 owning-domain facts/Jobs；
- Skill/MCP management 的只读 presentation 与精确命令入口；
- 附件授权、媒体预处理与 first-party Content/Media/domain Tool Host adapters。

## 唯一生产路径

```text
Desktop native Agent surface
  -> sender-bound typed Session / Permission IPC
  -> Desktop DSH Session / Permission Host
  -> package-owned Conversation binding + ACP application/projection
  -> ACP JSON-RPC stdio
  -> independently supervised DSH subprocess/profile
  -> DSH Agent / Session / Tool / Skill / MCP / internal Plugin authority
```

生产路径不得使用内嵌 Cordis、DSH Web/Client Runtime、TypeScript SDK、Remote API、系统 Node、全局
DSH、Electron `process.execPath` 或 Pi fallback。DSH runtime closure 必须随产品精确锁定；`scripts/dsh-q0`
只用于非发布资格验证，不进入发布包。

## 五层边界

| 维度 | 约束                                                                                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | DSH 拥有 Agent/Session/extension execution；OpenNeko Agent application 拥有 binding/projection；领域包拥有业务结果；Host 拥有信任和资源。     |
| 依赖 | Renderer 只依赖 typed contracts；Desktop Main 只组合 package public ports 与 concrete adapters；host-neutral packages 不依赖 Electron/React。 |
| 接口 | 使用 exact Conversation/DSH Session/turn/call/request/Job identity 与单一 canonical shape；禁止自由 JSON、内部版本和 active-state fallback。  |
| 扩展 | 用户扩展面只有 Skill/MCP；Plugin 只用于官方 DSH profile composition；领域能力以 typed DSH Tool 经 reverse Host request 调用 owning service。  |
| 测试 | deterministic tests 证明唯一 path/no-fallback；真实 Desktop + provider 验证行为；二者不能互相替代。                                           |

## 输入与上下文

Desktop 输入只保留四类稳定语义：`/command` 交给 DSH command runtime，`$skill` 显式选择 DSH
Skill，`@context` 引用由 owning resolver 授权的文件、资源、项目、selection 或实体，自然语言直接进入
Agent reasoning。Renderer 只负责 tokenization、候选展示与键盘交互，不执行命令、读取 Skill 正文、解析
领域资源或根据关键词预选 Tool/Skill。

Draft catalog 以首次提交将使用的 exact cwd 做无持久 Session 的 pre-turn discovery；已有 Conversation
始终使用绑定的 DSH Session catalog。首次提交必须原子创建正式 Session 并重新解析输入。未知、禁用、
冲突或陈旧引用明确失败，不得从 active Workspace、最近选择或 Renderer 状态推断目标。

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

## 创作与内容写入

普通 Agent reasoning 是唯一智能编排循环。Skill 提供方法，Tool/Capability 提供机器可执行契约，owning
domain 负责 validation、revision、持久事实、Job 和提交；Canvas、Cut、Character、World、Quality 或
Desktop 不建立领域专用 Agent loop、固定 stage 或跨领域 workflow runtime。

Agent 写入按 authority 分为两条路径：Markdown、Fountain、TXT、HTML、字幕和普通 JSON/YAML/CSV 等
可移植内容源通过授权 Workspace 文件能力读写；Canvas `.nkc`、Cut `.otio` 及其他 owner-declared
结构化项目只通过 owning-domain query/authoring port 修改。固定或封装格式由对应 reader/export owner
检查或重新生成。两条路径不互相 fallback，generic file Tool 不得修改受保护项目格式。

生成或处理结果先由 owning domain 提交 durable artifact，再返回稳定 locator、digest、provenance 和
必要 revision。写回项目必须指定 exact target 并通过目标 owner 的 revisioned apply；候选结果、聊天文本、
Canvas 投影或 UI selection 都不是项目事实，也不能自动覆盖当前或最近文档。

## Skill、MCP 与 Plugin

- Skill discovery/read/injection 由 DSH Skill runtime 拥有；Skill content 可以说明公开模型/工具的
  用户级方法，但不能授予 Tool visibility、schema、permission、Workspace authorization 或 Host trust，
  也不能把私有 transport/package schema 伪装成 portable runtime authority。
- MCP configuration/connection/tool exposure 由 DSH profile 拥有；OpenNeko 不维护 MCP client/manager。
- Plugin discovery/load/enablement 由精确锁定的官方 DSH profile 拥有；它是内部装配机制，不是用户可安装或配置的第三类扩展。首版不加载第三方 runtime/Webview JS。
- OpenNeko extension management 只展示 Skill/MCP，消费 DSH inventory/readiness/config/diagnostics projection 并提交精确命令，不建立第二 catalog/config authority。
- Browser Use 与 Computer Use 是官方 DSH MCP integrations。DSH 拥有 MCP connection、Tool discovery/call/cancel；OpenNeko Host 只拥有 OS 权限、exact target、sender-bound grant、approval 与 evidence。
- DSH 公开 inventory/settings API 不能形成 secret-safe 完整 contract 时，对应配置保持 visible unavailable；禁止读取私有模块或恢复旧 MCP/Plugin catalog。

Skill 的 portable authority 是 DSH 支持的 `SKILL.md` 及相对 `references/`、`scripts/`、`assets/`；
个人和 Workspace Skill 不需要 OpenNeko 私有 overlay、Plugin manifest 或 Marketplace 记录。通用
`CreateSkill` Tool 必须绑定 exact Conversation、目标 root 与用户审批，在授权 staging 中校验后
no-replace 发布，再由当前 DSH catalog 观察结果；不得覆盖、合并、自动改名、直接启用或手工注册。

格式校验、Host trust、contribution readiness 与 first-party 内容质量是不同边界。Prompt/Skill 只指导
行为；机器可判定 correctness 由对应 validator 负责，真实副作用只能由 Tool/owning service 执行。
未知 validator、非法 Skill 或单个 MCP failure 必须局部失败，不得清空 sibling catalog 或停用无关能力。

## 附件、媒体 Tool 与模型

ACP content block 是 Desktop 到 DSH 的唯一消息输入协议。Composer 图片通过 Host 授权和 DSH attachment admission 后以 DSH 原生 image block 进入 exact Session；运行中发现的文档图片通过 `openneko.read_image` Tool 返回同一原生 image block。当前 DSH 只原生持久化 PNG、JPEG、WebP 与 GIF；音频、视频、文档和其他文件在公开 block/lifecycle 补齐前，只能由 owning media/content Tool 生成有界、带来源的文本、metadata、转写或采样表示，不把 raw path、bearer URL 或旧多模态 packet 写入 Session。

当前 Agent 模型是媒体语义理解的唯一 LLM authority。附件或 Tool 结果所需模态受支持时由同一模型继续处理；不支持时只拒绝当前 submit 或 Tool call，并明确提示切换模型。产品不配置第二媒体分析模型，不隐式切换 provider/model，也不允许 Tool 用隐藏模型伪造成功。Generation 媒体模型/参数继续由 `@neko/generation-domain` owner 独立管理；未来专用 ASR/OCR/安全审核模型只能属于对应 Tool/service 的显式能力与审批边界。

## Credential 与安全

Host 是 provider credential authority。Secret 只能通过 Desktop SecretStorage concrete adapter 和受限 Host
port 解析，不能进入 ACP logs/stdout、DSH Session、Renderer、Evaluation facts 或 domain artifacts。Renderer
不得访问 Node/Electron、本地绝对路径、raw cache path、credential 或进程 handle。

ACP stdout 必须保持协议纯净；日志走 stderr 或受控 diagnostic。reverse request、permission 与资源授权必须
绑定完整 sender/Conversation/DSH Session/turn/call identity，并只接受 DSH 当前广告的 option/operation。

Agent 不直接执行任意 shell、扫描任意目录或加载任意插件代码。确有外部处理需要时，只能作为明确
owning Tool 的 Host adapter：冻结 executable、参数、环境、网络、输入 digest、超时与资源上限，以
隔离输入运行并将输出交给 owning domain 校验和持久化。网络、用户代码、显著成本、扩大授权范围和
不可逆写入需要明确审批；失败、取消或超时不得把部分输出包装成成功，也不得建立通用 External
Processor 或第二套 Capability runtime。

## Prompt 与 Capability

System Prompt 只负责通用行为、安全、工具发现与失败处理。领域 operation/schema/validation/diagnostic 由
owning capability/Tool contract 注入；Skill 只负责方法论和创作语义。Prompt/Skill 不得补偿 runtime、Tool、
provider、permission 或 artifact owner 的缺陷。

领域输出格式、创作表、Canvas/Cut plan 与 profile 规则不得进入默认 Prompt。Skill 可以描述领域流程和
公开工具方法，但不能声明执行成功；只读 validator 负责明确 profile 的 correctness，未注册规则不得被
视为已验证。Quality runtime 可以聚合 provider-neutral evidence 和 Gate，但领域 rubric、repair 与 apply
仍由 owning package 负责。

DSH 组装默认 system prompt 与 Skill；OpenNeko 只通过 exact Session context extension 注入经过校验的 Workspace、Canvas、Character、World 和引用 evidence。旧 Agent Prompt Builder、Input Processor、Capability registry 或多模态 packet 只有在对应功能已经接管后才删除；它们不能作为第二成功路径保留。

## Renderer 与生命周期

Desktop 原生 Agent surface 只选择并渲染 DSH-derived projection；卸载 UI 或切换 Scene 不得取消仍在运行、
排队或等待审批的 exact Session task。`@neko/agent-webview` 只拥有 DSH Session 与 Skill/MCP management browser presentation，
不拥有 Agent controller、transcript、queue、Skill/MCP/Plugin runtime 或 Host IO。

产品 lifecycle 只组合 create、bounded list/revalidation、load/resume、prompt、cancel、close/release 和 restart 后按 exact binding reload。缺少公开 Session delete 时保留局部 diagnostic，不把 close 当 delete；缺少 inbox-preserving release 时不提供离线 inbox 编辑，不建立 shadow queue 或泄漏 DSH owner。

## 验收

确定性门禁至少覆盖 ACP purity、subprocess lifecycle、exact binding、Session replay、permission/cancel、reverse
Tool request、Skill/MCP inventory、attachment/media Tool evidence、bounded payload、迟到 frame 隔离、唯一 registration 与 retired-path poison。`pnpm test:agent:eval`
只证明 key-free harness/schema readiness；真实行为必须通过完整 Desktop session owner、用户可操作 UI 和真实
provider 验证，并记录 effective model、terminal state、artifact/path evidence 与 no-fallback facts。

Evaluation canonical facts 使用 Conversation、DSH Session、turn/step/toolCall、permission preset、model receipt、Command/Skill、MCP/Tool provenance、attachment/media Tool evidence 和 domain Job/artifact identity。Pi run/branch/queue assertions 与 direct runtime driver 不得保留；visible UI 与 hidden full Desktop 都必须通过公开 Composer input path，缺少 driver/API 时报告 `infrastructure-blocked`。

发布前必须证明旧 Pi runtime、Webview message protocol、queue/confirmation、Skill Host、MCP Manager、Plugin
runtime 与平行 client 路径均不可达；真实 provider/API 或可见 UI 验收未执行时，发布门禁保持关闭。
