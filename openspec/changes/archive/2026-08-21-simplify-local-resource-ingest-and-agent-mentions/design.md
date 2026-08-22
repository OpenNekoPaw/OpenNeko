## Context

资源浏览器当前已经按 Files、Media、Assets 保留 owner，但 Composer 将 Files/Media 投影为
`ContentLocator`，将 Assets 投影为 `AgentContextPayload`。未提交实验又增加了 `openneko.assets` DSH
Tool。两者都会让 DSH 感知 Asset Library，而不是处理 Workspace 中的普通文件。

## Goals / Non-Goals

**Goals:**

- 让 Agent 的所有文件资源只通过 canonical Workspace `ContentLocator` 进入 DSH。
- 让全局素材在用户选择时成为 Workspace 普通文件，之后不再参与同步。
- 保留 Files/Media/Assets 三种来源标签，同时确保标签不是 identity 或 authority。
- 删除 Assets Tool 和所有 profile/ACP wiring，建立路径级 no-fallback 验证。

**Non-Goals:**

- 重做 Asset Library package/revision 模型、Media Library 连接管理或 Entity/Character/World lifecycle。
- 自动把搜索结果复制到 Workspace、自动更新已复制素材、去重全 Workspace 内容或建立 provenance ledger。
- 用通用 Resource aggregate、同步服务、cache manager 或长期 materialization task 管理本地复制。

## Decisions

### 1. 三层模型按 authority 组合

```text
Files / linked Media / installed Assets
  -> Project Entity semantic facts
  -> Character / World and other domain objects
```

Files、Media 和 Assets 仅在 Resources/`@` 展示层并列。Entity 可以引用 Workspace locator，
Character/World 可以引用精确 Entity 或领域版本，但下游对象不拥有源文件同步，资源层也不反向修改语义
或领域事实。

### 2. Asset 使用复制，Media 连接使用受管链接

Asset Library 是 OpenNeko 管理的全局素材集合。用户在一个 Workspace 使用素材时，Assets service 从
精确 active membership 解析源文件，验证源是 Asset root 内的普通文件，然后复制到 Workspace
`assets/`。复制使用临时文件和 exclusive publish，冲突时生成 `name (2).ext` 等新名称；绝不覆盖现有
文件。成功结果只有新的 `WorkspaceFileContentLocator`。

Asset 不使用 symlink。否则删除/移动全局素材会破坏项目，源更新会隐式改变项目结果，Workspace path
guard 还必须长期允许另一套外部 target。一次性复制更符合本地创作产品的用户预期，也不需要同步、
relink、recovery 或 provenance 状态机。

Media Library 服务的是大体积、用户显式连接的外部目录，复制成本和目录结构不同，因此继续使用唯一的
`neko/assets/<libraryName>` 受管 symlink/junction。它只由 connection + Workspace binding 授权并可重建；
普通 symlink、nested escape 和缺失 binding 必须 fail-closed。

### 3. `@` 查询与选择分离

`composer-mentions` 只读取 Files/Media/Assets/Entity 投影，不写文件。Asset candidate 携带 Host 可重新
验证的精确 Asset identity 和展示 metadata，但不能携带 raw path 或伪造 locator。用户选择 Asset 后，
Renderer 通过同一 DSH Session Host typed bridge 请求 materialize；Host 重新解析 sender-bound Surface、
Workspace grant 和 Asset membership，调用 Assets service，并返回 locator-backed mention。Composer 随后
复用既有 file reference token。

直接输入、过期 candidate、missing membership、unavailable source、grant mismatch 或复制冲突耗尽时只让
当前选择失败并展示 diagnostic。不得把 Asset context payload、Assets Tool、active/recent Workspace、
全局 Asset path 或搜索时复制作为 fallback。

来源标签 `file | media | asset` 只用于 presentation。提交时 references 仍是 label +
`ContentLocator`；DSH 不接收 origin tag。

### 4. 删除 Assets Agent Tool

Asset 搜索/选择是确定性的产品资源操作，不需要模型决定，也没有独立长任务或领域事务。注册
`openneko.assets` 会重复 `@` 并增加 profile plugin、ACP reverse request、permission 和 Tool activity
lifecycle。该 Tool、plugin、schema、Host adapter、inventory/profile/runtime closure 注册全部删除。

Generation、Canvas、Cut、Character、World 和 Document Tool 不受影响，因为它们执行明确的领域操作，
而不只是资源发现。

### 5. Owner 与运行边界

| Owner           | Public path / role                                       | Producer                       | Consumer           | Runtime boundary        | Replaced path                             | User-data impact                        |
| --------------- | -------------------------------------------------------- | ------------------------------ | ------------------ | ----------------------- | ----------------------------------------- | --------------------------------------- |
| Assets Domain   | `@neko/assets-domain` materialization contract/policy    | Composer selection intent      | Assets Node        | host-neutral            | Asset `AgentContextPayload` / Tool schema | none                                    |
| Assets Node     | `@neko/assets-node` materialization service              | active membership + Asset root | Desktop adapter    | Node/filesystem         | DSH Asset search service                  | creates one user-visible Workspace file |
| Agent Contracts | `@neko/agent-contracts/dsh-session-host` typed selection | preload/Renderer               | Desktop Main       | IPC contract            | context-backed Asset mention              | none                                    |
| Agent Webview   | existing MentionMenu/file reference components           | Host projection                | user Composer      | Renderer                | custom Asset context chip                 | presentation only                       |
| Desktop         | sender/grant adapter and public-port wiring              | exact Surface/grant            | Assets service     | Electron trust boundary | Tool Host adapter                         | no domain state                         |
| DSH             | standard ACP resource link                               | Workspace locator              | model/Tool readers | subprocess              | `openneko.assets`                         | none                                    |

生产逻辑留在 Desktop 的部分必须读取 Electron sender 和 Window-bound grant；命名、复制、冲突和 Asset
membership 校验均为 host-neutral/Node 业务，不留在 `apps/*`。

## Evaluation

- `create`: 当前 Evaluation coverage index 没有拥有 Workspace Asset `@` materialization 的 target 或
  suite；不得把 launch binding、普通文件输入或其它相邻 suite 当作该行为的证明。target-scoped case 由
  `replace-pi-with-dsh-runtime-atomically` 10.7 创建，覆盖可见 Composer 选择、exact Workspace locator、
  DSH resource link、Provider 响应和 Assets Tool 未注册。
- `excluded`: 文件名规范、containment、普通文件校验、conflict-safe copy、查询无副作用与 typed IPC
  admission 使用 Assets Node、Agent contracts/Webview 和 Desktop deterministic tests；模型行为不会改变
  这些纯文件和边界契约。
- 当前可见 Desktop 没有可选择的真实 Asset membership，因此 target-scoped real case 记录为
  `infrastructure-blocked`。不能用 mock、普通 Workspace/Media 文件、截图或最终文本替代。

## Risks / Trade-offs

- 大素材复制会占用 Workspace 空间；这是显式“使用素材”的成本，避免了更复杂且脆弱的跨库同步。
- 同一素材多次选择可能产生多个文件；首版不引入内容寻址或 dedupe registry，用户可通过普通文件管理删除。
- `assets/` 可能与用户目录同名；service 只把它当普通 Workspace 目录并采用不覆盖策略，不声明专用隐藏格式。

## P1 Follow-up Boundaries

以下问题分别拥有独立生命周期，不并入本变更的生产实现：

- Media Library portability/recovery 继续由 `restore-workspace-linked-media-access` 收敛显式
  add/relink/remove managed link 与用户数据边界。
- Asset/Resource presentation 继续由 `unify-workspace-resource-and-project-content-browser` 负责；Renderer
  拥有 filter/selection，Main 只保留授权 adapter。
- Canvas delivery 继续由 `unify-agent-workspace-board-delivery` 负责。
- semantic/Search reconciliation 继续由 `simplify-resource-entity-character-world-boundaries` 负责。
- Skill/MCP 与官方内部 Plugin 的 DSH extension lifecycle 继续由
  `replace-pi-with-dsh-runtime-atomically` 负责。

本变更不复制这些 owner 的 task、状态或恢复逻辑，也不为了统一资源入口增加跨领域 lifecycle manager。
