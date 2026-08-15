## Context

当前产品同时存在三种不同但被界面语言混淆的概念：目录授权意义上的 Workspace、可编辑的 Content/Character/World 对象，以及 Character Dialogue/World Experience 运行实例。Content 已按目录进入 Workspace；Character 与 World 的 authoring facts 目前由 `@neko/chara-node`、`@neko/world-node` 与运行记录一起写入用户级 SQLite；Desktop 又分别暴露 Project、Character、World 管理 Scene。这样既无法自然表达“一个项目内同时创作内容、角色和世界”，也容易让管理入口、编辑器、Agent target 与正式 runtime 互相代替。

本设计保留三个领域 owner，只统一授权与组合方式。核心模型是：

```text
Workspace authority
  + exact AuthoringTargetRef
  + owner-provided ToolComposition
  = one visible Authoring Workbench composition
```

`Workspace authority` 只证明某个受信 Host root 及其相对路径可访问；`AuthoringTargetRef` 只指向一个明确的可编辑对象；`ToolComposition` 只决定当前可见的 package Root 与 slots。三者具有不同 owner、identity 和生命周期，不合并为 generic creative record、统一 Session 或跨领域可写 registry。

### 五层分析

| 层面 | 结论                                                                                                                                                                                                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | `@neko/project` 只拥有 Content Project 的组合成员关系与精确依赖；Chara/World/Content 各自拥有事实、校验、发布与工具；Host 拥有目录授权和 Window scene；Agent 拥有 Draft/Conversation/Turn；Desktop 只做 Electron trust boundary、native adapter 和可见 Root wiring。                    |
| 依赖 | Project composition 可以依赖 Chara/World 的 L0 identity/ref contract，但 Chara/World 不依赖 Project；Node repositories 依赖 package contract 与注入的受限文件能力，不依赖 Electron/React；Webview 只依赖 renderer-safe public contract。                                                |
| 接口 | Workspace grant、owner-qualified target ref、composition membership、catalog projection、surface ref、Agent binding receipt 和 runtime launch ref 分别使用窄 contract；不存在读取当前 editor、active Project、最近记录或路径字符串来推断 authority 的接口。                             |
| 扩展 | 新领域若需要 authoring，只增加自己的 target kind、repository、catalog/root provider 与显式 composition case；不会注册 wildcard tool、generic CRUD 或 first-compatible handler。新增正式 runtime 仍由该领域独立定义。                                                                    |
| 测试 | package producer tests 验证 codec/service/repository，Desktop consumer tests 验证 exact delegation 和 Root 卸载，真实 Electron 验证用户路径，Agent Evaluation 验证 target/capability routing；poison tests 验证没有 SQLite fallback、active-target fallback、隐藏 Root 或第二 handler。 |

### 当前约束

- Renderer 不接收 raw path，也不直接访问 Node/Electron；Workspace root 由 Desktop Main 的 sender-bound grant 解析。
- 领域事实必须继续由 owning package 定义；`apps/neko-desktop` 不得新增 project/character/world 业务 DTO、事务或恢复规则。
- 内部 contract 只有一个 canonical shape，不增加 `version`、`schemaVersion`、migration marker 或新旧 dispatch。
- CharacterVersion、World publication 等用户可管理版本继续保留其领域 version identity；它们不是内部 contract generation。
- 一条记录、一个 target 或一个 slot 失效时必须 fail-local；不得阻止 sibling catalog、Workspace、runtime 或 Window Shell。
- 现有 Character/World SQLite bytes 不得删除、覆盖或作为新文件仓库失败后的成功来源。

## Goals / Non-Goals

**Goals:**

- 将 Content、Character、World authoring 统一到目录授权的 Workspace 基础能力上，同时保持领域事实 ownership 独立。
- 支持一个 Content Project Workspace 同时管理内容、项目本地 CharacterProject 与 WorldProject。
- 支持 standalone Character/World 通过 library-managed Workspace root 独立创作，并复用与 project-local target 完全相同的领域 service、codec、Studio 和 publication path。
- 用应用左侧导航提供 Project、Conversation、Character、World 四个明确分区；Project/Character/World 各自进入 owner-qualified management destination，不在领域页面内重复提供跨领域 mode switch。
- 让 Agent Entry 明确区分 Assistant、Authoring、Character Dialogue、World Experience，并严格区分 mutable authoring target 与 published runtime target。
- 原子替换本次边界内的旧 authoring persistence、producer、consumer、fixture 与 registration，保留正式 runtime 的独立生命周期。

**Non-Goals:**

- 不建立跨领域 CreativeEntity、统一字段 schema、统一 archive/delete/publish command 或 writable global catalog。
- 不把 Workspace、Project、Conversation、CharacterRun、WorldRun 或 React Root 合并成统一 Session/OpenInstance。
- 不让项目本地角色/世界自动进入 standalone library，也不在本变更中实现自动提升、移动、同步或云端协作。
- 不为 Content 创建正式 runtime；不允许 draft、preview、authoring test 或 mounted editor 作为 Character/World 正式运行 authority。
- 不在 Desktop 应用根实现 host-neutral 业务逻辑，不建立动态插件式 editor/tool registry。
- 不做隐式 SQLite migration、dual-read/dual-write 或失败后回退旧 repository；不把内部 format generation 写入文件。

## Decisions

### 1. Workspace、Authoring Target 与 Tool Composition 使用三个正交 contract

Workspace authority 继续由 `@neko/host` 的 grant contract 拥有；领域 target identity 由各 owning domain 拥有；Workbench scene 只投影 closed surface union。代表性形状如下，最终实现必须复用现有 branded identity codec：

```ts
type AuthoringTargetRef =
  | { kind: 'content'; contentProjectId: ContentProjectId }
  | { kind: 'character-project'; characterProjectId: CharacterProjectId }
  | { kind: 'world-project'; worldProjectId: WorldProjectId };

interface AuthoringBindingReceipt {
  readonly draftId: AgentDraftId;
  readonly connectionId: AgentLaunchConnectionId;
  readonly workspaceId: WorkspaceId;
  readonly workspaceGrantId: WorkspaceGrantId;
  readonly target: AuthoringTargetRef;
}
```

这个 closed union 可以由 Agent launch contract 组合，但 target 的解析、读写和 eligibility 仍委托对应 owner。receipt 只证明当前 Draft 的绑定，不持久化 raw path，不成为 target fact。切换 mode、Workspace、target、connection 或 sender 会使不匹配 receipt 失效。

未采用“Workspace 自己包含任意 creative document”的 generic aggregate，因为这会复制领域 schema并把目录容器升级为业务 owner。未采用由当前 mounted Root 推断 target，因为 Root 是可丢弃 presentation，不能授予写权限。

### 2. 新增窄职责 `@neko/project` 与 `@neko/project-node`

`@neko/project` 是 host-neutral composition owner，建议公开：

```text
@neko/project/contracts
@neko/project/application
@neko/project/testing
```

它只定义 `ContentProjectComposition`、project-local target membership、external publication dependency refs、placement metadata、codec、command service 与 catalog projection port。它可以引用 `CharacterProjectId`、`CharacterVersionId`、`WorldProjectId` 和最终由 World owner冻结的 publication identity，但不读取或嵌入角色/世界 payload。

`@neko/project-node` 公开唯一 Node repository entry，负责受授权 Workspace 内 composition 文件的路径约束、解析、atomic replace 和逐项 diagnostic。它不拥有 Workspace grant，不扫描用户主目录，不实现 Chara/World repository，也不依赖 Electron。

现有 `@neko/host/desktop-project-management-service` 中决定 Project catalog mutation、membership 或 domain dependency 结果的部分必须触碰即下沉到 `@neko/project/application`。Host 只保留 Project registration、Workspace grant、Window scene transition 与 catalog projection attachment。

未把 composition 放入 `@neko/host`，因为成员关系与发布依赖决定领域结果，且可在注入 file port 后脱离 Electron 测试。未把它放入 Content，因为 Project 可以组合多种内容工具和外部发布物，Content artifact 不应拥有角色/世界成员关系。

### 3. 文件布局由 owner 固定，所有持久路径保持 Workspace-relative

Canonical layout：

```text
<authorized-root>/
  neko/
    project-composition.json
    characters/
      <characterProjectId>/
        project.json
        versions/<characterVersionId>.json
        authoring-tests/<authoringTestSnapshotId>.json
    worlds/
      <worldProjectId>/
        project.json
        publications/<worldPublicationId>.json
```

- `project-composition.json` 仅存在于 Content Project Workspace，由 `@neko/project` codec 解析。
- `characters/**` 仅由 `@neko/chara` contract/application 与 `@neko/chara-node` repository 解释。
- `worlds/**` 仅由 `@neko/world` contract/application 与 `@neko/world-node` repository 解释。
- standalone Character library root 使用相同 `neko/characters/**` 布局；standalone World library root 使用相同 `neko/worlds/**` 布局。差异只在明确授权的 root 与 catalog scope，不在 domain shape 或 service。
- 文件内容不写内部 schema/contract version。不可变 publication 文件名与内容携带用户领域 publication identity，mutable project 文件携带当前 canonical authoring facts。
- Content 文档继续使用其现有目录和 owning repositories；本设计不强迫所有内容进入 `neko/content/**`。

具体 World publication type/name 必须在实现任务开始时与活跃 World changes 收敛为一个 canonical owner shape；不能同时保留 `WorldVersion` 与 `WorldExperienceVersion` 两套成功 contract。若当前 `WorldVersion` 是基础发布而 Experience 是其上层发布，Project 只引用可被正式 Experience runtime 消费的那个精确 immutable identity。

未采用单个 `creative-project.json` 保存全部事实，因为它会让 Project codec 解释其他领域 payload，并让一个损坏对象拖垮整个项目。未采用用户级 SQLite 保存 authoring facts，因为项目本地对象必须随 Workspace 明确归属、可见且可移植。

### 4. Repository 只走一条文件成功路径，并按最小记录隔离错误

`@neko/chara-node` 将 authoring repository 与 runtime repository 拆为不同 public constructions：

- file-backed `CharacterAuthoringRepository` 负责 CharacterProject、immutable CharacterVersion 与 authoring-test snapshot；
- runtime/interaction/memory/relationship repository 继续按其 owning lifecycle 使用用户级 durable store；
- standalone 与 project-local authoring 都构造同一个 file repository，只注入不同的 exact authorized root。

`@neko/world-node` 同理：WorldProject 与 immutable eligible publication 使用 file repository；WorldRun/WorldSave aggregate 继续由 runtime repository 管理。catalog service 组合 authoring catalog projection 与 runtime projection，但二者不是一个 repository，也不互相作为 fallback。

每次写入都先通过 domain codec，写入同目录临时文件、flush 后 atomic rename；immutable publication 已存在且 bytes/parsed facts 不同则失败。目录 realpath、symlink containment 与 grant 校验由 Node/Host 边界完成。批量 catalog 逐目录读取，单文件 decode/root failure 产生 owner-qualified record diagnostic，并保留有效 sibling。

现有 `createPersistentCharacterRepository` 与 `createPersistentWorldRepository` 的“一个 SQLite repository 同时实现 authoring + runtime + catalog”接口将被拆除。生产 composition 不注册 SQLite authoring adapter，测试必须断言 authoring read/write 不触达 `chara_projects`、`chara_versions`、`world_projects` 或 `world_versions` 表。

### 5. Project composition 是成员关系 authority，不是事实副本

代表性 composition：

```ts
interface ContentProjectComposition {
  readonly contentProjectId: ContentProjectId;
  readonly localTargets: readonly (
    | { kind: 'character-project'; characterProjectId: CharacterProjectId }
    | { kind: 'world-project'; worldProjectId: WorldProjectId }
  )[];
  readonly dependencies: readonly (
    | { kind: 'character-version'; characterVersionId: CharacterVersionId }
    | { kind: 'world-publication'; worldPublicationId: WorldPublicationId }
  )[];
}
```

数组元素必须通过 exact identity 去重，顺序只在产品明确声明为用户事实时保留；label、thumbnail、validation state 等从 owner projection 获取，不复制到 composition。外部依赖只接受 immutable eligible publication，禁止 `latest`、名称匹配或 active target。

创建 project-local target 的 application workflow 为：

1. Project service 验证 exact Workspace composition authority 与不存在同 identity member。
2. 对应 domain service 在该 Workspace root 创建 canonical target；Desktop 不参与 payload 组装。
3. Project repository atomic replace composition，加入 exact target ref。
4. 两次 durable commit 均成功后才返回 target binding。

若第 3 步失败，新 target facts不被静默删除或报告成功；owner 返回“unlinked project-local target”diagnostic，并提供精确重试关联或显式删除入口。catalog 只能在 exact `neko/characters/**` / `neko/worlds/**` scope 检测此状态，不能扫描其他 root 或自动修复。这样避免跨文件伪事务丢失用户数据，也不建立 recovery fallback。

external dependency 绑定只写 composition；编辑来源必须显式 handoff 到其 standalone Studio。删除/移除 membership 不删除 domain facts，除非用户另行执行 owning-domain delete 并通过引用检查。

### 6. Management 复用 Workbench shell，但从应用左栏直接进入 owner catalog

Host scene contract 使用一个 `creative-management` scene type 和精确 catalog context：`content-projects | characters | worlds`，以避免恢复三个平行 scene contract。这个 catalog 是 Host navigation identity，不是页面内 mode。应用左栏分别发出 Project、Character、World 的精确导航 intent；进入目标后不得再渲染“所有项目 / 角色 / 世界”分段切换器。

- Content Project catalog 由 `@neko/project` application projection提供。
- standalone Character catalog 由 `@neko/chara` projection提供，只枚举已注册 Character library roots。
- standalone World catalog 由 `@neko/world` projection提供，只枚举已注册 World library roots。
- project-local records 只从打开/管理的 exact Project composition projection进入 Project scope，不注入 standalone catalog。
- 搜索框、排序控件、列表/网格布局与空状态可复用 `@neko/ui` primitive；create/open/remove/archive/publish/launch command 始终发给当前 owner。
- Character 与 World management 使用受控 Workbench 的 Main + Secondary Main 组合：Main 挂载 owner-owned 列表/网格 catalog，Secondary Main 挂载所选记录的配置/详情。World 的 runtime preview 只能作为 World detail 内的明确区域，不能恢复为第三个跨领域或全高并列管理模式。
- Project management 使用同一 Workbench management chrome 和 package-owned catalog；只有出现真实 project detail 生命周期时才增加 Secondary Main，不用空详情面板伪造对称性。
- 应用左栏的轻量 navigation projection 分为 Projects、Conversations、Characters、Worlds。Character Dialogue 与 Room conversation 投影进入 Characters；World section 在 World-owned Agent Conversation producer 可用前保持可见空状态，不伪造 World Conversation 或从 WorldRun 推断 Conversation。

Desktop 现有 `DesktopProjectManagementSurface` 中的领域列表 presentation 应下沉到 Project Webview package；Desktop 只根据 closed surface ref 挂载 public Root。Character/World 已有 package Root继续复用。不能建立接受任意 record 的 `CreativeManagementItem` writable DTO、combined delete command 或页面级跨领域 selector。

### 7. Project Workbench 使用轻量导航 refs，同一 slot 只挂载一个领域 Root

Project Workspace 的资源/导航 projection 可以同时列出 Content documents、project-local Character/World targets 与 external read-only dependencies。每一项只保留 owner-qualified ref、显示 projection 与 package-owned最小 presentation snapshot。

激活 Content、Character 或 World target 时，Host/Project application 产生一个 validated scene composition：Main slot 指向 exact package Surface，Interaction/Resource/Timeline/Status slots只包含该 owner声明且当前产品支持的 surfaces。Desktop renderer 通过 closed union映射到 package public Root；unknown/mismatched surface 在该 slot 失败。

切换 target 的顺序为：提交 outgoing owner允许的 selection/scroll/layout/draft snapshot，卸载 outgoing Root及 subscriptions/media handles，校验 incoming target authority，再挂载 incoming Root。失败时保留 Project tree和 sibling refs，但不保留旧 Root充当 fallback。后台 Agent turn、CharacterRun或WorldRun按其 exact runtime owner继续，不因 authoring Root卸载而取消。

Workspace 的 Primary Main 是稳定的可见布局区域，不以已有 Main View 为存在条件。fresh Workspace 在没有 Content、Canvas、Character 或 World View 时，默认显示 package-owned 的 canonical empty presentation；该 presentation 不进入 Main View catalog，不获得 authoring target identity，也不创建或推断 Board。Character/World 以 Secondary Main 打开时继续保留这个空 Primary Main，关闭 Secondary Main 后仍回到同一 fresh state。

未采用 retained tab deck/LRU，因为访问历史不是资源所有权；没有测量证据支持跨领域 Root cache。显式可见分屏未来可以增加 `secondaryMain`，但必须由独立 OpenSpec定义支持的 target pair和资源预算。

### 8. Agent Entry 使用意图名称，并分离 authoring 与 runtime binding

Agent Entry segmented control 固定为：

```text
Assistant | Authoring | Character Dialogue | World Experience
```

- `Assistant` 绑定 Agent owner定义的 Assistant context。
- `Authoring` 先取得 exact Workspace grant，再由 Content/Chara/World owner选择或创建 mutable target，形成 `AuthoringBindingReceipt`。
- `Character Dialogue` 只接受 Chara-owned eligible CharacterVersion、可选 storyline与participant配置；首次提交事务创建 exact Dialogue/Room/CharacterRun。
- `World Experience` 只接受 World-owned eligible publication或 exact Run/Save/branch配置；首次提交事务创建/恢复 exact runtime。

mode switch 保留未发送文本与通用模型 presentation，但清除不兼容的 authority receipt、target results 与 pending query。entry selector 不出现在 Creative Management、Studio、Conversation 或 runtime scene，也不发送 management navigation intent。

Agent capability composition 按 exact receipt向 owner请求 typed catalog/tool snapshot。所有 mutation必须再次携带 target identity并由 owner校验。Prompt文字、mention、当前树行和 mounted editor只可作为内容证据，不能授权写入。现有 `Workspace` launch label与只表达 Assistant/Workspace的成功分支在同一 contract update中替换；不得保留 alias mode或文本编码的 Character/World handler。

#### 8.1 Agent Entry 的快速操作区与全局导航分工

应用左侧栏继续拥有 Window 级全局导航，只回答“去哪里”：Projects、Conversations、Characters、Worlds 的轻量目录行可以切换到 exact management、Conversation 或 runtime Scene。全局 Agent Entry 保留现有 Assistant、Authoring、Character Dialogue 与 World Experience segmented mode selector；输入框下方的快速操作不再承担 mode 切换，只显示当前 mode 明确提供的入口操作。Assistant Entry 可以展示 Agent catalog 明确提供且当前 Draft 可执行的全局 Skill 快速操作，不从项目、侧栏或最近记录推断；Authoring 提供“选择创作目标”，Character Dialogue 提供“选择角色”，World Experience 在 owner provider 合格前不制造可执行操作。快速操作区不复制完整管理目录，不持久化“已打开”状态，也不因选择 target 导航离开 Entry。

Composer 的 DOM、宽度、内部工具栏和定位保持不变，并保持最小信息密度：输入、附件、模型/审批和发送属于 Composer；只有 Authoring mode 可以在工具栏增加一个“打开目录”授权动作，创作目标、角色、素材、项目和可见发送阻塞说明不进入 Composer 内部。文件、素材和其他逐消息引用仅在用户实际选择后继续显示为输入框上方的 reference chips。Composer 上方只显示居中的当前模式标题，不显示说明段落、状态副标题、带边框介绍卡片或 Skill 气泡；标题采用接近 Codex Entry 层级的 28px welcome-heading scale，但不得扩张为占据页面的超大 Hero。顶部模式选择器使用共享控件的 compact density、480px 最大宽度和与相邻界面一致的 12px 字号。Composer 下方显示一个默认展开、可折叠的当前模式资源/操作组件；Assistant body 明确命名为 Skills，并只显示 catalog-qualified executable Skills；Authoring body 在首次展开时读取一个只读聚合目录，同时纳入所有已注册且可访问 Content Project、这些 Project 内的 Character/World target，以及 standalone Character/World target，并把它们作为同一层资源卡横向优先排列。用户只点击最终资源卡完成 Draft target 选择，不需要先点 Project 或类别卡触发第二次候选读取，也不在 Entry 内展开新建表单；新 target 继续由对应 management/Workbench 创建。聚合读取由 Host 与各 owner 使用已注册的 exact Workspace identity 完成，不向 Renderer 投影 raw path，也不为未选择的 target 创建可写 binding receipt；单个 Project 或 owner 读取失败只产生局部 diagnostic，不能隐藏其他资源卡。每张卡保留稳定的 media、标题、说明/metadata 和状态/动作区域，方便 owner 后续投影真实缩略图；当前 contract 没有 thumbnail 时只显示类型图标或中性占位，不生成假素材或 raw path。目录授权与 Content Project、Character、World 和新多人 Room 配置不得混成一个列表或一个含混的“选择目标”动作；目录入口直接调用 Host 授权，新多人 Room 只通过多选已发布 Character 配置。未选择目标、空角色库和未接入 World 不再渲染说明性提示句；发送按钮保持不可用，空或不可用内容可以折叠、禁用或省略。已有 Conversation/Room/Run/Save 的“继续”入口只有在对应 owner 提供 exact durable identity 时才能出现；“在 Workbench 打开”是显式次级导航动作，不能代替“加入当前 Draft”。新 Dialogue/Room/Run 仍只在首次提交事务提交时 materialize，不能由展开组件或空 Workbench 预创建。

快速操作 frame 是 Agent Webview 拥有的 L2 presentation，按当前 Entry mode 组合 owner-projected body；Chara、World、Project 和 Content 继续拥有 catalog、validation、creation 与 launch commands，Desktop 只做 typed bridge/wiring。Authoring Workspace、Assistant Conversation、Character Dialogue/Room 和 World Runtime 一旦创建或恢复，就不再渲染全局 Entry 快速操作，只加载该精确业务实例 owner 提供的模式信息和局部操作；没有 owner-defined 信息时直接省略，不制造占位面板。不得引入跨领域可写 catalog、通用 Workbench/session registry、active target inference 或保留隐藏 domain Root。收起详情、切换 mode 或离开 Entry 时卸载当前 body；Draft receipt、未发送文本和 owner facts 分别由其 canonical owner 保留。

响应式布局不再依赖 Entry 或 Window 宽度阈值，也不使用右侧 Overlay、drawer、sheet 或 backdrop。标题、Composer 和可折叠组件由一个 Entry-only normal-flow wrapper 组成，并通过 safe center 在可用高度内整体上下居中，避免只居中 Composer 或让下方展开体把 Composer 压向视口底部；内容超过可用高度时由 Entry 从顶部开始滚动。可折叠组件在 Composer 下方的同一内容流内展示，折叠头始终保持单行可读；Authoring 的 exact Project、Character、World 资源卡和 Assistant Skills 均按可用宽度在唯一网格中自然换行，catalog loading 期间继续显示已有 Project 卡片但不插入改变组件高度的临时提示文案，真实 owner failure 仍显示明确 diagnostic。展开内容保持动态高度并在 Entry 的可滚动区域中继续向下，不横向挤压、缩放或重排 Composer。宽度变化和折叠切换不能清除 target、receipt、Draft 文本或选择状态。Character Interaction、World Runtime 等非 Entry Scene 不渲染该组件，也不得替换其 owner-defined `rightManager`。

五层边界如下：

1. **职责**：Agent Webview 决定 Entry 快速操作与内联详情的展示、焦点和换行；owner package 决定候选、资格、创建和运行结果。
2. **依赖**：Renderer 只消费 typed、只读 projection 与 command callbacks；Workspace 授权、文件读取和 durable mutation 保留在 Host/owner boundary。
3. **接口**：共享 frame 只接收 mode-qualified action、expanded state 和 owner body；mode-specific body 使用现有 exact receipts，不发明跨领域 target union 作为第二事实来源。
4. **扩展**：新增 owner category 时组合新的 body/provider；不得扩展为全局导航、retained Workbench deck 或 fallback catalog。
5. **测试**：覆盖窄/宽自然换行、Composer 几何稳定、mode switch、选择保留、body 卸载、exact receipt、一次聚合展示全部 Project/Character/World、单 Project 读取失败的 sibling 隔离、未选择资源不创建 write receipt、无 management navigation 和无 runtime 预创建。

### 9. Authoring test、preview 与正式 runtime 使用独立 owner和持久化

Content authoring只有编辑、preview/export/job，不创建 ContentRun。Character draft可以生成 immutable authoring-test snapshot，但该 snapshot不能创建正式 memory、relationship或Dialogue/Room。World draft可以生成确定性 preview/test state，但不能创建WorldRun/Save。

正式 runtime始终从 exact eligible publication启动。运行时 repository、task、queue、approval、memory和save不绑定当前 Window scene或Workspace active identity。Studio可以提供“测试”与“发布后运行”两个明确命令，但两者的 contract、记录和状态展示不能合并。

### 10. 生产模块与边界清单

| Owner                   | Package role / canonical public entry                                        | Producer                                  | Consumer                                           | Runtime boundary                            | Replaced path                                                                 | User-data impact                                             |
| ----------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Project composition     | L0/application `@neko/project/contracts`, `@neko/project/application`        | Project command/repository                | Project catalog、Workbench、Agent target provider  | host-neutral                                | `@neko/host/desktop-project-management-service` 中的领域 mutation/composition | 新增 `neko/project-composition.json`，不嵌入其他领域 payload |
| Project files           | L1 `@neko/project-node`                                                      | Project repository                        | Project application                                | authorized Node filesystem                  | Desktop/local-metadata Project fact writes                                    | atomic workspace-relative file；decode失败局部可见           |
| Workspace authority     | L1 `@neko/host/desktop-workspace-grant-*`                                    | Desktop Main native chooser/grant adapter | Project/Chara/World/Agent providers                | Electron Main/preload trust boundary        | raw/current/recent path inference                                             | 不持久化 raw path到领域文件或 renderer                       |
| Character authoring     | L0/application `@neko/chara/contracts`, `@neko/chara/application`            | Character service/codec                   | Chara Studio、Project、Agent provider、publication | host-neutral                                | mixed SQLite repository authoring methods                                     | CharacterProject/version/test写入 exact Workspace files      |
| Character files         | L1 `@neko/chara-node`                                                        | file authoring repository                 | Chara application                                  | authorized Node filesystem                  | `chara_projects`/`chara_versions` 正常产品读写                                | 旧表字节保留但不作为成功路径                                 |
| Character runtime       | L1 `@neko/chara-node` runtime-specific entry                                 | Dialogue/Room/Character runtime services  | Agent session、Chara runtime UI                    | background runtime/local durable store      | mixed mega-repository construction                                            | run/memory/relationship不随 Workspace Root切换               |
| World authoring         | L0/application `@neko/world/contracts`, `@neko/world/application`            | World service/codec                       | World Studio、Project、Agent provider、publication | host-neutral                                | mixed SQLite repository authoring methods                                     | WorldProject/publication写入 exact Workspace files           |
| World files             | L1 `@neko/world-node`                                                        | file authoring repository                 | World application                                  | authorized Node filesystem                  | `world_projects`/`world_versions` 正常产品读写                                | 旧表字节保留但不作为成功路径                                 |
| World runtime           | L1 `@neko/world-node` runtime-specific entry                                 | World runtime service                     | Agent session、World runtime UI                    | background runtime/local durable store      | mixed mega-repository construction                                            | Run/Save继续独立持久化                                       |
| Management presentation | L2 Project/Chara/World Webview roots；Host scene contract                    | owner catalog projection                  | Desktop renderer                                   | sandboxed renderer                          | Desktop-owned Project list与三个独立顶层 management入口                       | 只保存轻量 selection/layout snapshot                         |
| Workbench composition   | `@neko/host/desktop-scene-contract` + package Root exports                   | Host/Project scene projector              | Desktop renderer                                   | Window navigation/presentation              | Content-only Main与隐式 active target                                         | 不复制领域事实；旧 Root切换即卸载                            |
| Agent entry/binding     | `@neko/agent-contracts/agent-launch-host`, `@neko/agent-runtime/application` | Agent Draft service + owner providers     | Agent Webview/Pi capability composition            | Draft/Conversation/background Agent runtime | `Assistant                                                                    | Workspace                                                    | Character | World` 与特殊 handler | receipt可丢弃；Conversation/Turn保持独立 durable facts |
| Electron composition    | `apps/neko-desktop` Main/preload/renderer entry                              | typed IPC/native adapter/public Root map  | Window/webContents                                 | Electron application boundary               | app-owned业务 DTO、target推断与domain mutation                                | 仅操作 opaque identity/grant；无领域文件解释                 |

保留在 `apps/neko-desktop` 的代码只有必须使用 `BrowserWindow`、`webContents`/sender identity、native directory chooser、preload IPC、CSP/protocol或React product shell的 adapter/wiring。所有可以通过注入 file/catalog/clock/id port脱离Electron决定业务结果的逻辑都下沉 package。

### 11. 错误隔离与观测

错误携带 `owner + operation + workspaceId/root registration + target/record identity`，但日志不包含 raw home path、secret或整个用户 payload。处理范围：

- grant/path/sender不匹配：拒绝当前 request，其他 Workspace与Window保持可用；
- composition单项 ref失效：保留该行及repair target，阻止受影响 publication/launch；
- domain file decode失败：保留 owning catalog diagnostic，sibling继续；
- package Root未注册：只显示该 slot的owner-qualified unavailable；
- Agent receipt stale：阻止当前submit/mutation，保留输入与无关 Draft；
- runtime publication失效：阻止当前 launch，不回退latest、draft或其他publication。

## Risks / Trade-offs

- [Project 与 domain target 分别写文件，无法获得跨文件系统级原子事务] → domain record先提交、composition后提交；只有两者成功才返回成功。第二步失败保留精确 unlinked diagnostic和显式重试/删除，不自动删用户事实或伪造membership。
- [文件 catalog 比单个 SQLite query更易受局部损坏和大目录影响] → 只枚举已授权、已注册的exact roots和固定目录深度，逐项解析、分页投影；性能证据不足前不增加跨领域cache或全盘扫描。
- [Standalone 与 project-local共用布局可能诱导全局扫描] → catalog registration明确记录scope/root authority；standalone projection绝不遍历已知Project roots，Project projection只读其composition和fixed domain directories。
- [当前 World publication命名与未来 Experience publication可能冲突] → 实施前先在 World owning specs冻结唯一eligible publication identity，并原子更新producer/consumer；不得用两个union case或compat alias过渡。
- [拆分 mixed SQLite repository可能影响仍在运行的Character/World runtime] → 分别构造authoring与runtime repositories，以compile-time窄port连接；runtime测试断言run/save/memory仍命中唯一repository且不依赖authoring root。
- [旧 SQLite authoring数据在新产品路径不可直接打开] → 保留原数据库字节；切换前完成数据资格盘点。存在需保留的用户记录时提供显式、owner-owned的离线export/import流程并逐条报告，不在production repository中dual-read或自动迁移。
- [统一管理壳可能再次泛化领域命令] → shell只持有catalog kind和无业务UI primitive；contract tests禁止generic mutation DTO、combined delete与wildcard handler。
- [Agent mode名称变化会与相邻活跃changes冲突] → 本change作为新canonical意图，实施时先rebase/修改相邻OpenSpec与fixtures，再一次性替换launch contract、provider、Webview和Desktop wiring。
- [多领域工具同时出现造成界面拥挤或Root驻留] → target owner声明最小slot composition；非当前Root卸载，Project tree仅保留refs；没有显式split contract时不同时挂载两个Main Root。

## Migration Plan

1. 先协调相邻活跃changes：将 `add-home-experience-entry-modes` 的 `Workspace/Character/World` 标签和 `compose-desktop-workbench-scenes` 的Content-only假设更新为本设计的canonical intent/target contract；World publication identity由World owner先冻结。
2. 新建 `@neko/project`、`@neko/project-node` 与其architecture/poison tests，建立composition codec、repository和Project catalog projection；此时不注册第二条生产成功路径。
3. 在Chara/World中拆分authoring与runtime ports，实现唯一file-backed authoring repository，并先完成package producer tests。对已有SQLite数据做只读资格盘点；任何恢复通过显式离线export/import交付，不进入normal repository composition。
4. 原子切换Desktop Main construction、IPC consumer、fixtures与catalog providers到Project/Chara/World public entries；删除SQLite authoring registration和app-owned Project business path。旧SQLite表及bytes保持原样，不自动删除。
5. 接入Creative Management scene、Project target tree与package-owned Studio Roots；验证target切换只挂载当前Root，局部invalid record不影响sibling。
6. 一次性更新Agent launch contract、Draft provider、capability routing与Entry UI四个意图；删除旧mode alias、特殊文本handler和active Workspace/target推断。
7. 运行package、workspace、architecture、Electron、UI和Agent Evaluation gates。只有file authoring、exact binding、formal runtime三条边界均通过后才解除Character/World产品资格gate。

开发阶段可按依赖顺序回退尚未发布的提交，但不能通过恢复旧SQLite adapter作为运行时fallback。新文件authoring一旦向用户发布，回退旧二进制会使新事实不可见，因此发布后的恢复策略是roll forward修复canonical file path；必要时先将受影响target置为只读diagnostic。任何删除旧SQLite bytes的清理都必须是后续独立、用户可见且有备份/恢复证明的change。

## Open Questions

- World owner需要在实施前确认正式runtime消费的唯一publication identity和文件名：沿用一个canonical `WorldVersion`，还是由活跃World change原子改名为`WorldExperienceVersion`；本设计不允许并存兼容路径。
- standalone Character/World library root的默认位置与用户改选入口应由Host settings还是各domain catalog registration拥有。无论选择哪种，领域文件只保存相对路径，Renderer只接收opaque identity。
- 现有SQLite authoring表中是否存在已对真实用户承诺的数据需要通过发布级显式export/import恢复；实施前必须完成数据资格盘点并记录结论。
- Project-local target移除后的产品语义需要在实现前确认是“仅解除membership并保留文件”还是同时提供独立的owning-domain删除命令；默认采用前者，删除必须单独确认并进行引用检查。
<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-14):** Standalone mutable authoring roots, direct Character/World authoring destinations, and standalone Agent target selection are historical implemented context only. They MUST NOT receive new production work; the successor owns their atomic replacement and user-data recovery.
