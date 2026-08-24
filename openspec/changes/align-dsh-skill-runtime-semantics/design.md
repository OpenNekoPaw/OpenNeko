## Context

当前生产路径已经由 DSH standard preset 挂载 `@deepseek-ai/dsh-skill-filesystem` 与 `@deepseek-ai/dsh-tool-skill`，并由 OpenNeko bridge 调用 `ctx.skills`。但三个边界仍不一致：

1. 所有 DSH Session 被固定到 `${DSH_HOME}/workspace`，因此 project roots 不对应真实 Workspace。
2. Session input catalog 使用 `{ cwd, scope: agent }`，Extension management 使用 `{ cwd: virtualCwd }`，两者可能观察不同 registry layer。
3. `invokeSkill` contract 只携带一个 `skillName`，而 DSH 原生显式输入和模型工具路径都允许加载多个适用 Skills。

DSH 的模型目录只渲染 `name + description`，完整正文按需加载；`whenToUse` 不参与默认模型目录。DSH 对正文没有大小上限，资源只作为按需读取指引而不是自动附件。设计必须保留这些事实，不能声称 OpenNeko metadata 改变了 DSH 路由。

## Goals / Non-Goals

**Goals:**

- 让所有 Skill discovery、resolution、get 和 injection 都经过同一个 DSH scoped registry。
- 恢复 DSH project/personal/custom/bundled 来源和上游 precedence。
- 支持模型自动多 Skill与用户显式多 Skill组合。
- 让 DSH invocation policy 和 relative resources 可被真实使用与验证。
- 删除错误的 Skill 数量、主次、profile 和正文资格限制。

**Non-Goals:**

- 不 fork、复制或重写 DSH Skill parser/registry。
- 不建立 OpenNeko Skill activation state、推荐器或关键词 router。
- 不改变 DSH 来源 rank、同名覆盖或正文渲染形态。
- 不开放第三方 executable Plugin/Webview。
- 不在本变更实现 Skill 创建和内容创作规范；它们由后续独立变更拥有。

## Decisions

### 1. 锁定 DSH 包是 Skill 语义的唯一事实源

兼容性代码与文档引用锁定版本的公开类型、README 和运行测试。OpenNeko 可以投影 DSH 事实，但不能增加会使 DSH-valid Skill 失效的格式规则。升级 DSH 时，以独立依赖升级变更重新审计字段、rank、scope、资源和调用语义。

以下不是允许的产品限制：固定 Skill 总数、一次仅一个主 Skill、强制 Artifact Profile、只允许 builtin source、禁止 flat Markdown、禁止调用策略组合、禁止 Skill 提到公开工具。

工具可见性、sandbox、approval、Workspace 授权和 Tool schema 仍是有效安全边界；Skill 文本不能改变这些 authority。

### 2. exact Conversation 决定 DSH lookup cwd

`@neko/agent-runtime` 在创建或恢复 DSH Session 时从 exact Conversation binding 请求一个 Host 授权的 lookup context：

- Assistant Conversation 使用 Host-owned Assistant cwd，不投影任何 Workspace project roots。
- Workspace Conversation 使用该 Workspace 的 canonical authorized root，或 Host 管理的等价 opaque projection cwd；该 cwd 必须让 DSH filesystem provider 按原生规则观察 `.dsh/skills` 和 `.agents/skills`。
- Renderer 不传递物理路径，bridge 不从 active/recent Workspace 推断路径。

如果产品必须隐藏真实 Workspace path，Desktop 可以物化一条稳定、opaque、sender-bound 的 projection cwd，但它必须映射到同一 Workspace authority，并让 DSH 的 project root 语义保持不变；不得复制 Skill 到 bundled root、custom mirror 或缓存目录来制造第二事实来源。

DSH Session header 的 cwd 与 Conversation binding 一起恢复。原 Workspace 不可用时，仅该 Conversation/Skill source 返回 diagnostic，不切换到 Assistant cwd 或其他 Workspace。

### 3. 每个消费方使用同一 Agent scope

bridge 为 exact Session 取得 `agent` scope，并通过同一个 helper 读取：

```text
Conversation binding
  -> authorized lookup cwd
  -> exact DSH Agent scope
  -> ctx.skills.snapshot({ cwd, scope: agent })
  -> management / composer / explicit invocation / model tool
```

全局 Extension 页面若没有 exact Session，不得假装展示某个 Workspace 的胜出目录。它可以展示明确标注的 personal/bundled 全局视图；Workspace-specific 视图必须由用户选择 exact Workspace/Conversation 后建立临时 Agent scope 或使用 DSH 公开的等价 scoped lookup。

不完整 snapshot 保留已发现候选并返回 `complete: false`。需要执行的显式调用 fail-visible；只读 UI 显示不完整诊断，不把部分结果伪装成完整目录。

### 4. 显式输入支持多个 DSH Skill invocation

`@neko/agent-contracts` 将单值 `skillName` intent 替换为 ordered `invocations`：每项包含用户选择的 exact Skill name 和该次 gesture 的参数片段。整体输入仍保留原始用户请求。

bridge 在同一 authoritative snapshot 中逐项校验 `userInvocable`，然后构造一个 DSH-native prompt batch。DSH 负责解析、同名去重、正文渲染和注入；OpenNeko 不实现第二套 Skill loader。列表不设置产品级 Skill 数量上限，只有通用输入 payload 上限继续适用。

任一显式选择 unknown、stale、non-user-invocable 或 snapshot incomplete 时，整次尚未提交的输入失败可见，不把 `/name` 留作普通 Prompt。模型自动路径不受此契约限制，仍可多次调用 DSH `skill` tool 加载所有适用 Skills。

### 5. 管理投影保留策略事实但不泄漏资源位置

安全管理 projection 包含：`name`、`description`、可选 `whenToUse`、`source`、`provider`、`modelInvocable`、`userInvocable`、catalog completeness 和 bounded diagnostic。

`metadata` 只在存在产品 consumer 的 allowlisted 字段上投影；未知 metadata 保留在 DSH authority，不参与 OpenNeko 路由。`path`、directory `resourceBase` 和正文不进入 Renderer catalog。打开资源由 sender-bound opaque command 定位。

### 6. DSH resourceBase 是唯一 Skill 资源语义

Skill 可以从正文引用相对资源。DSH 只向模型说明资源 base，不自动枚举或读取资源；实际读取必须经过当前可见的文件/网络工具及其权限。OpenNeko 不把整个 references/assets 目录预注入 prompt，也不复制资源成为 attachment。

资源验证至少覆盖 directory Skill 的相对 reference、flat Skill 无 package sibling 的行为、路径穿越拒绝、缺失资源 diagnostic，以及一个 Skill 资源失败不影响 sibling Skills。

### 7. 纠正规范，而不是增加另一层兼容标签

更新 `AGENTS.md`、Accepted ADR、活动 OpenSpec 和静态检查：

- 保留“Skill 不授予 runtime authority”和“私有协议由 owner 管理”。
- 删除“任何具体工具名/参数说明都会使 Skill 不合格”的 blanket rule。
- 明确公开、稳定且对用户有意义的模型/工具使用指导可以写入 Skill，但执行前以当前 DSH Tool catalog/schema/permission 为准。
- `agents/<host>.yaml` 等跨 Host overlay 可以作为其他 Host 的附属文件存在，但不是 DSH invocation metadata；DSH 字段只来自 `SKILL.md` frontmatter。

## Five-layer analysis

- 职责：DSH 拥有 registry、provider、selection 和 injection；Agent package 拥有 Conversation lookup coordination；Desktop 只做授权和 concrete path projection。
- 依赖：`@neko/agent-contracts` 保持 L0；DSH 类型只在 bridge adapter；Renderer 不依赖 Node/DSH。
- 接口：一个 ordered explicit invocation contract 和一个 scoped catalog projection；不引入 Skill runtime port。
- 扩展：未来 DSH provider、source 或 metadata 通过 DSH registry 加入，不要求修改 Composer router。
- 测试：provider/scope/contract 用确定性测试，真实选择和多 Skill行为用完整 Desktop + provider Evaluation。

## Risks / Trade-offs

- Workspace cwd 可能扩大 DSH 可见文件范围。缓解：只从 exact sender-bound Workspace authority 建立 cwd，继续由 DSH sandbox 和 Host Tool authorization 控制副作用。
- 多 Skill正文增加上下文成本。缓解：依靠 DSH 渐进目录与按需正文；通过 Evaluation 观察成本和冲突，不以硬数量限制代替证据。
- DSH `whenToUse` 不进入模型目录。缓解：把路由边界写入短 `description`；管理 UI 不宣称 `whenToUse` 改变模型选择。
- 上游 developer preview 可能改变契约。缓解：精确锁定包并在升级时重跑 compatibility fixture。

## Migration Plan

1. 冻结 rc.8 compatibility fixture 和现有 bridge/source inventory。
2. 修改规范和静态门禁，先删除错误的额外限制但保持工具权限门禁。
3. 引入 exact Conversation lookup context，并原子切换 Session create/list/load/resume 与 Skill lookups。
4. 统一 management/input/invocation scoped snapshot helper。
5. 原子更新单 Skill contract 的全部 producer、consumer、fixture 和测试为 ordered multi-invocation shape，删除旧字段。
6. 增加 DSH source、policy、resource 与 fail-local tests；运行真实 Desktop Evaluation。

没有旧/新 Skill contract 并行路径。发布前可整体撤销变更；发布后只沿 DSH canonical path 修复，不回退虚拟全局目录或单 Skill adapter。
