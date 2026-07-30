## Context

Canvas 当前已有六种 canonical 节点类型：`markdown`、`media`、`group`、`job`、`file`、`canvas-embed`，并已有 `ContentLocator`、共享 Job lifecycle、Generation Job、Preview、Cut、Media Library 与 Desktop Host authority。问题不在缺少另一套节点枚举，而在于这些既有边界没有被组合成唯一运行路径：

- Canvas Webview 通过路径、旧 `ResourceRef` 和自由 provenance 猜测节点是否为生成结果。
- Desktop content authoring 只接收 `workspace-file`，其余 locator 和全局/外部来源被迫走临时路径或旧 AssetLibrary adapter。
- 选择工具栏把“快速生成”当作通用 Canvas 动作，而不是 Generation owner 对合法来源和生命周期的能力投影。
- 旧 `saveCanvasMaterialToAssetLibrary` / promotion 路径与已经接受的 Media Library、Creative Entity 和 generated-output 模型冲突。
- 生成摘要被同时当作展示证据与可执行 recipe，无法可靠重放，也无法区分失败 Job 的 retry 与成功结果的 regenerate。

本变更跨 `neko-types`、Canvas domain/Webview/host adapter、Desktop、Assets、Generation 以及 Preview/Cut 等能力 owner，因此需要在实现前固定职责、契约、迁移和路径级验证。

### 五层分析

| 层次 | 结论 |
| --- | --- |
| 职责 | Canvas 拥有空间编排和持久投影；Content owner 拥有内容身份与授权；Generation/Agent 拥有 recipe、Job 和 provider 生命周期；Preview/Cut/媒体工具拥有读取或派生操作；Media Library 拥有关联与复制。 |
| 依赖 | Canvas 只依赖共享 `ContentLocator`、`JobRef`、节点契约和 action descriptor；Host 注入 owner capability，不允许 Canvas 反向导入 viewer/editor/provider 内部实现。 |
| 接口 | 一个严格 authoring request、一个 owner action catalog、一个显式媒体库复制接口、一个 Generation Job/result projector；每个 instance-scoped request 携带 project/canvas/job identity。 |
| 扩展 | 新媒体类型或创作工具通过 owner descriptor 与 locator resolver 注册，不增加 `generated-image`、`referenced-video` 等组合节点类型，也不修改 Canvas 核心条件分发。 |
| 测试 | 同时断言持久结果和 canonical handler/adapter 被命中；旧 AssetLibrary、路径启发式和空 Media 路径必须被 poison，并在测试中证明没有参与。 |

## Goals / Non-Goals

**Goals**

- 将节点渲染类型、素材来源和异步生命周期分为正交事实。
- 让工作区、已链接媒体库、全局媒体库、外部文件和生成结果沿明确且可移植的路径进入 Canvas。
- 让引用素材的修改默认非破坏，生成素材通过稳定 Job identity 重新生成新结果。
- 让 Canvas 工具栏只展示 owner 实际提供且对当前选择合法的动作。
- 删除 normal authoring 中的 AssetLibrary promotion/import 平行路径。

**Non-Goals**

- 不在 Canvas 中重新实现 Preview、Cut、图片编辑、音频处理、模型 viewer 或 provider execution。
- 不恢复 Asset catalog、Asset membership 或 `project://assets/`。
- 不把 Creative Entity 变成新的文件节点类型；Entity 只提供稳定实体引用及其活动 representation。
- 不在本变更中设计远程协作、云端多租户或跨设备同步。
- 不通过自动复制所有媒体库文件来制造项目隔离；链接库仍保持外部目录语义。

## Decisions

### 1. 使用“节点类型 × locator 来源 × Job 生命周期”三轴模型

节点 `type` 只决定渲染器。素材来源不新增可持久化的第二份 `origin` 字段，而是从已经验证的 `ContentLocator` 唯一导出：

- `generated-output` → generated
- `workspace-file` / `document-entry` / `package-resource` → referenced

`job` 节点是 owner Job 的只读投影；它不等同于空媒体节点，也不持有 provider runtime。`media`/`file` 只有在存在 durable locator 时才合法。

这样避免 `origin` 与 locator 漂移，也避免 `generated-image`、`external-video` 等组合枚举爆炸。路径、标题、旧 ResourceRef、runtime URL 和 provenance 只可用于显式迁移/诊断，不能参与正常分类。

**替代方案：持久化 `origin: referenced | generated`。** 拒绝，因为它复制了 locator 的事实，旧文档迁移后仍可能产生矛盾状态。

### 2. 生成结果保留共享 JobRef，而历史摘要只用于展示

共享契约新增最小、可序列化的 Generation 引用，基于 `JobRef<'generation'>`，由生成结果节点持有：

```ts
interface CanvasGenerationEvidence {
  readonly jobRef: JobRef<'generation'>;
  readonly summary: CanvasMaterialGenerationContext;
}
```

`summary` 是提交时 prompt/model/参数等 creator-facing 快照，创建后不可变；它不是下一次执行的 recipe authority。Generation owner 通过 `jobRef` 读取权威 request：

- 失败 Job 的 **retry** 沿现有 Job retry 语义恢复同一次执行。
- 成功结果的 **regenerate** 克隆或派生新的 Generation Job，记录前一 Job/result lineage，并产生新的 `generated-output` identity。
- “修改参数生成”先在 Generation/Agent-owned draft 中编辑，再提交新 Job；Canvas 不直接修改历史摘要。

如果 locator 是 `generated-output` 但引用的 Job 已不可解析，节点仍可预览并展示历史摘要，但 regenerate 动作必须隐藏并给出可见原因。

**替代方案：用 `CanvasMaterialGenerationContext` 直接重放。** 拒绝，因为展示摘要不保证包含 provider schema、输入 locator、版本和默认值，无法成为可靠 recipe。

### 3. 四条进入路径共用一个 Host-owned authoring transaction

Canvas 发出 typed authoring intent，Host 完成授权、读取/复制、locator 创建与节点 commit。Canvas 不接触绝对路径或物理链接目标。

1. **工作区或已链接媒体库**：直接保留精确 workspace-relative `workspace-file` locator。`neko/assets/<libraryName>/...` 已代表库链接后的项目可见路径，不再复制字节或创建逐文件软链接。
2. **未链接的全局媒体库**：用户显式选择“关联整个媒体库”或“复制此文件到项目”。关联由 Media Library owner 创建项目链接；复制进入项目拥有位置。只有得到项目可授权 locator 后才创建节点。
3. **任意工作区外文件**：原子复制到 `neko/imports/<kind>/`。该目录是项目用户数据，不是 cache；参与项目保存、打包和备份，不自动清理。Host 使用受限读取、内容 fingerprint、可见冲突策略和原子写入；成功后以新 `workspace-file` locator 创建节点。
4. **AI 生成**：先创建 transient generation draft，提交后投影 `job` 节点；只有 Generation owner commit 成功的 `generated-output` 才投影 Media/File 结果。

单次 transaction 必须以“写入/关联完成 → locator 严格验证 → 节点 commit”为顺序。任一步失败都不创建空节点或临时引用。

**替代方案：外部文件始终让用户选择目标目录。** 拒绝作为默认路径，因为它会让拖放失去确定性；用户仍可显式选择复制到某个已链接媒体库。

**替代方案：把全局库绝对路径写入 NKC。** 拒绝，因为不可移植且绕过 project authority。

### 4. Creative Entity 保持实体事实与表现内容分离

当用户把 Entity 添加到 Canvas 时，Entity owner 先解析当前活动 representation。Canvas 创建对应 canonical Media/File/Canvas-embed 节点并保留稳定 entity ref；内容仍由 representation locator 读取。Entity 名称、关系和角色事实不伪装成文件路径，也不复制进 provenance 作为第二事实源。

活动 representation 后续变化不静默重写既有 Canvas 节点。用户可显式刷新/替换表示，从而保留画布历史可复现性。

### 5. 引用节点操作一律创建派生结果

普通引用节点支持两类动作：

- **只读/编排动作**：预览、全屏、Reveal、复制节点、打开 Preview/Cut/模型 viewer。
- **派生动作**：裁剪、擦除、重绘、去噪、分离、补帧、转码或 AI 变体。owner 写入新输出，Canvas 创建新节点与 `derived-from` lineage，源 locator 和源文件不变。

引用节点不显示历史 generation summary 或 regenerate。AI redraw 等动作是“以此为输入创建 Generation Job”，不是把原节点转换成 generated。

生成结果包含所有适用的基础动作，外加历史摘要和在 `jobRef` 可解析时的 regenerate/edit-and-generate。

### 6. 动作由 owner capability descriptor 贡献

Canvas domain 定义小而稳定的 descriptor，不持久化 callback：

```ts
interface CanvasMaterialActionDescriptor {
  readonly id: string;
  readonly owner: string;
  readonly labelKey: string;
  readonly icon: string;
  readonly mediaKinds: readonly string[];
  readonly origins: readonly ('referenced' | 'generated')[];
  readonly selection: 'single' | 'homogeneous-many' | 'any-many';
  readonly effect: 'read' | 'derive' | 'copy' | 'handoff' | 'generate';
}
```

owner capability provider 根据 active project、Canvas instance、内容授权、codec/工具可用性和选择上下文返回 descriptors。该查询必须绑定精确 Canvas revision 与 selected node identities，并允许 owner 异步确认当前 runtime authority（例如 Generation recipe 是否仍可解析、Cut session 是否仍可接收素材）。Canvas 做交集投影并 dispatch typed action intent；Host router 在执行前按同一 selection/revision 再次解析 descriptor，再调用 Preview、Cut、Generation、Media Library 或具体媒体工具。

多选只显示所有选中节点都满足 descriptor 声明的动作。没有注册 owner 时动作省略，不渲染 no-op 或通用 fallback。

action descriptor 只存在于 selection-scoped Host projection，不进入 Canvas document，也不作为与选择无关的静态 snapshot 能力。Webview 必须丢弃 revision 或 selection 已变化的异步查询结果；Host 必须拒绝查询后已失效或执行时不再可用的 action，不能继续调用旧 owner 或 fallback。

**替代方案：Canvas 内按扩展名硬编码完整工具栏。** 拒绝，因为会重复各子包能力、导致 Desktop 与 VSCode Webview 漂移，并让新增工具修改 Canvas 核心。

### 7. Media Library 复制必须显式命名目标和所有权

移除 `saveCanvasMaterialToAssetLibrary`、`AssetLibrary.importFile` 及等价 promotion message。替代操作分别表达：

- copy to selected project-linked media library
- copy to selected global media library
- import external file to project-owned import root

每个请求都携带 source locator、destination identity、conflict policy、project/canvas identity 和授权上下文。复制结果不改变源节点身份，也不创建 Asset membership。全局复制返回 global projection，但绝不把全局绝对路径持久化回 Canvas。

老消息、adapter 和 handler 在迁移完成后必须删除或 poison；不能通过 alias、fallback 或双写继续成功。

### 8. Desktop 是本阶段运行态验收宿主

Canvas domain、contracts 与 Webview component 继续保持 host-neutral；Desktop composition 注入 content authoring、Generation、Media Library、Preview/Cut/model capability。Phase 1 的可见交互和媒体运行态使用 Electron Desktop 与合成 workspace 验收。

本变更不要求修改或验收 VSCode 宿主路径；若实现阶段实际修改 `apps/neko-vscode` 或 Extension Webview adapter，则必须另行增加对应宿主验证，不能用 Desktop 结果替代。

### 9. Agent/Generation 路由需有 evaluation disposition

本变更改变 Generation Job 创建、输入 locator 路由、retry/regenerate 区分和 Agent capability dispatch，实施时必须按 `neko-agent-evaluation` 规划至少一个 key-free harness case 与一个真实 provider case。真实 provider 未获 provider/model/cost 授权时，必须记录阻塞条件，不能把 mock/harness 结果描述为真实生成验收。

## Risks / Trade-offs

- **旧 NKC 无 canonical origin。** 不允许继续猜测会使部分旧节点进入 inspection-required 状态。代价是用户需要迁移/重新关联，但可以避免把普通文件误标为生成结果。迁移不得删除原始文件。
- **Job 记录被清理。** generated-output 仍可读，但 regenerate 会不可用。历史摘要保留用于说明，不伪造可执行 recipe。
- **链接媒体库指向外部数据。** 直接引用保持现有语义，删除/写入必须由 Media Library 的显式 mutation authority 控制；Canvas 派生操作不覆盖目标文件。
- **动作 descriptor 增加注册工作。** 换取 Desktop、Canvas 和各工具 owner 之间的稳定边界，并消除 Canvas 内部条件分支。
- **外部导入产生副本。** 会占用项目空间，但保证可移植、授权明确和可重复打开；UI 应显示导入位置及冲突结果。
- **生成结果累积。** regenerate 不覆盖历史输出，可能增加存储；清理属于显式资源管理，不由 Canvas 自动回收。

## Migration Plan

1. 在共享契约中加入严格的 generation evidence、authoring request 和 action descriptor，并先补 codec/validation 失败测试。
2. 增加一次性 NKC inspection/migration：
   - 已有 canonical locator 的节点按 locator 迁移；
   - 仅有路径/provenance 猜测的节点标记为 migration-required；
   - 不删除、移动或覆盖任何用户文件；
   - legacy classifier 在正常 runtime 中 poison。
3. 将 Desktop authoring 收敛到四条 Host-owned transaction，加入 `neko/imports/<kind>/` 原子导入与显式全局库 link/copy。
4. 接入 Generation draft → Job projection → generated result projection，并分离 retry 与 regenerate。
5. 引入 owner action catalog，迁移 Preview、Cut、媒体/模型与 Generation 动作；删除 Canvas 内通用 quick-generate 和硬编码 viewer/editor 分支。
6. 替换旧 AssetLibrary 消息、adapter 与测试 fixture；旧 handler 必须拒绝并有路径断言。
7. 用 `~/Git/neko-test` 的隔离副本或等价合成 workspace 验证 Desktop：直接引用、外部复制、库关联/复制、生成成功/失败、非破坏派生、多选动作和重启恢复。
8. 完成 typecheck、相关包测试、Desktop production build、边界检查、OpenSpec/Agent evaluation，并记录真实 provider 阻塞或证据。

若需要回滚实现，回滚代码和新文档 schema，但保留已经复制到 `neko/imports` 或生成目录的用户文件；不得为了回滚自动删除内容。旧 AssetLibrary 路径不作为回滚方案重新启用。

## Open Questions

无阻塞问题。`neko/imports/<kind>/`、locator-derived origin、JobRef authority、显式媒体库目标和 Desktop Phase 1 验收均作为本提案的实施约束；实现中若发现既有 owner contract 无法表达这些约束，必须更新本设计和 specs，而不是增加兼容 fallback。
