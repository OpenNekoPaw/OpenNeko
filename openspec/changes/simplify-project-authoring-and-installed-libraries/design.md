## Context

> SUCCESSOR: simplify-project-authoring-and-installed-libraries
>
> Successor disposition (2026-08-15): This design supersedes the active implementation promises
> in `refine-character-management-authoring-and-version-graph`,
> `refine-world-management-authoring-and-runtime`,
> `separate-companion-and-narrative-character-conversations`,
> `simplify-resource-entity-character-world-boundaries`, and
> `unify-domain-authoring-workspaces` where they require standalone mutable authoring,
> installed/adapted/recovery lifecycles, publication plans, or competing entry destinations.
> Those changes retain only compatible domain facts and runtime behavior; this document owns the
> replacement contracts and deletion scope.

现有变更把一个本地 Electron 产品设计成四套相互衔接的生命周期：Workspace authoring、Installed Library、Runtime 和 Recovery。角色/世界需要经过 Draft → Version → Installed Release → Adapt in Project，并通过项目级 publication plan 组合输出。代码因此出现 `installedReleaseId`、领域版本 ID 和 Project target ID 等重叠身份，以及未被生产 Desktop 消费的 installed-library Root。

最新产品边界更窄：工作区负责编辑，全局目录负责复用，运行时消费全局精确版本。角色和世界使用同构流程，ZIP 仅负责携带一个版本。该变更原子替换旧模型，不保留兼容路径或残留数据恢复路径。

## Goals / Non-Goals

**Goals:**

- 入口 Agent 只保留对话和创作，保持现有主侧边栏与管理页面。
- 同一角色/世界 Creator Skill 在 Project-bound 创作和 Assistant-bound 快创中分别使用明确的工作区或全局 authority。
- 一个 Project 工作区同时承载内容、角色、世界和未来 owner-qualified 对象。
- 角色和世界采用相同的工作区对象、全局对象、全局版本和精确引用语义。
- 以一次“同步到全局”完成首次共享或后续版本更新。
- 对话、Room 和世界互动直接使用全局精确版本。
- 以单版本 ZIP 支持角色/世界导入导出。
- 原子删除 installed、adaptation、recovery 和 publication-plan 路径及其残留数据。

**Non-Goals:**

- 不实现 marketplace、远程同步、多设备冲突、协作编辑或分支版本图。
- 不自动合并工作区与全局修改，不自动跟随最新版本。
- 不把 Project 变成角色/世界事实 owner，也不建立跨领域通用 CRUD 仓库。
- 不把 ZIP 挂载为仓库、运行时来源、watcher 或持久 identity。
- 不迁移、兼容读取或恢复旧 installed/adaptation/recovery 数据。

## Five-Layer Analysis

### Responsibilities

- Project 拥有工作区 membership 和精确依赖；Chara/World 拥有对象事实、版本、同步与运行资格；Agent 拥有会话/turn；Desktop 只拥有窗口组合和 Electron 信任边界。
- “同步到全局”是 Chara/World application service 的领域命令，不是 Desktop 文件复制命令。
- ZIP 校验与文件操作位于 Node adapter；导入结果由领域 service 决定并提交。

### Dependencies

- Renderer 仅依赖 package-owned contracts 和 preload 暴露的最小 port，不读取文件或 Electron API。
- Chara/World application service 依赖可注入 repository、resource staging 和 clock port，不依赖 Electron。
- Project 只存 owner-qualified exact ref，不依赖角色/世界 payload codec。

### Interfaces

- 每个业务意图只有一条 canonical command：加入全局引用、复制到工作区、同步到全局、导入 ZIP、导出 ZIP、启动互动、显式更新引用。
- 命令使用精确 Project、工作区对象、全局对象和全局版本 identity；禁止 latest/name/active 推断。
- 单条对象或版本失效只拒绝对应操作并显示 diagnostic，不影响 sibling 对象、项目和会话。

### Extension

- 新领域可复用 Project 的 owner-qualified membership 形状，但必须拥有自己的事实、版本和服务。
- 角色与世界保持同构用户流程，不抽成共享可变聚合或 universal repository。
- 未来若有远程同步或 marketplace，需要独立 OpenSpec 定义 authority 与冲突，不预留当前内部版本或 adapter 层。

### Tests

- contract 测试证明 producer/consumer 使用单一 shape，且不存在 installed/adaptation/recovery parallel path。
- application/repository 测试覆盖首次同步、后续版本、冲突、失败原子性、精确引用和 sibling 隔离。
- archive 测试覆盖不可信 ZIP；Desktop/Electron 测试覆盖 sender/path 授权和完整用户路径。
- 可见 UI 验证覆盖入口、上下文栏、工作区列表、角色多选、世界单选、组合选择和当前会话 manager dock。

## Decisions

### 1. 两个入口不改变既有导航

“对话”和“创作”只是入口 Agent 的模式，不是新的 Window 导航或 durable session。左侧主侧边栏保持原样。

创作模式选择一个精确 Project 后，把 Project 加入 Composer 上下文栏并留在 Agent scene；选择不直接打开 Project Workspace。工作区自身只在用户进入项目创作场景时显示，不嵌入入口 Agent。对话模式通过全局目录选择角色和世界：角色可多选，世界可单选，二者可同时存在。

Character Dialogue、Room 和 World Experience 的 Agent、形象/世界展示、manager list 是当前 owner 的可见投影。manager 只管理当前会话参与者，不显示“打开会话”或跨会话导航。每个面板有显隐按钮，不能隐藏最后一个可见面板；无形象时 Agent 占主区域，manager 保持窄辅助 Dock。

Creator Skill 不因入口模式复制成两套 Skill，也不在入口显示 Skill 卡片。Project-bound Agent 只获得创建工作区对象的 capability；Assistant-bound Agent 只获得直接创建全局对象及首个不可变版本的 capability。两条路径都使用标准 Tool approval 作为唯一确认，但写入 authority、receipt 和成功文案必须明确区分“工作区角色/世界”与“全局角色/世界”。助手快创不得生成 Project identity、隐藏工作区对象、同步记录，或推断 active/recent Project。

### 2. 角色和世界采用同构的两层对象模型

```text
Project Creative Workspace
  ├─ local editable Character / World
  └─ exact read-only Global CharacterVersion / WorldVersion refs

Global Character / World
  └─ immutable v1, v2, v3 ... (one current version for default display)
```

工作区本地对象可编辑。加入全局对象时，Project 只保存所选精确版本的只读引用；全局对象更新不会改变该引用。用户要修改全局对象时执行“复制到工作区”，生成新的本地 identity 和独立事实，不在原全局版本上直接编辑。

每个全局对象有稳定 identity，每次同步或 ZIP 更新创建一个不可变用户领域版本。`currentVersionId` 只用于全局管理默认展示和提示新版本，运行时和 Project consumer 必须保存精确 version identity。

助手快创是全局 owner 的原子首次创建命令：有效 Creator proposal 经确认后一次提交稳定全局对象 identity、首个不可变版本和 `currentVersionId`。该命令与工作区“同步到全局”共享全局 catalog 的提交不变量，但不创建或伪造 workspace source；全局版本由对应 `globalCharacterId` / `globalWorldId` 拥有，工作区本地定稿版本继续由精确 workspace object identity 拥有。

这是用户可见的领域版本，不是 contract/schema 版本。内部 DTO、IPC、codec 和存储格式保持单一 canonical shape，不增加 schema version 或版本分发。

### 3. 同步到全局替代发布、安装和适配

工作区本地对象只提供一个共享动作“同步到全局”：

1. 未关联全局对象时，创建全局对象和首个版本。
2. 已关联且 `lastSyncedGlobalVersionId` 等于当前全局版本时，创建下一个版本并更新 current。
3. 全局 current 已变化时，禁止自动覆盖或合并。用户只能明确确认以本地内容基于当前全局版本创建新版本、另存为新的全局对象，或取消。

同步成功后，工作区保存稳定全局对象 identity 与本次同步的精确版本 identity，用于判断本地/全局是否变化。同步失败不得产生版本、移动资源或改变已有 current。线性 `parentVersionId` 只表达用户可见历史，不实现分支、merge 或发布状态机。

Project 不再拥有多输出 publication plan。角色/世界的“发布”就是同步到对应全局目录；内容继续遵循其 owner 的既有输出语义。

### 4. 运行时只消费全局精确版本

未同步的工作区对象不能直接进入对话、Room 或 World Experience。对话选择器只列出有效全局版本：

- 一个角色版本启动 Character Dialogue；
- 多个角色版本启动 Room；
- 一个世界版本启动 World Experience；
- 一个世界版本与多个角色版本可以同时作为 World Experience 的精确输入。

Dialogue、Room、World Run 和 Save 保存版本 identity，而不是对象名称、current/latest、工作区对象或 ZIP 路径。全局产生新版本后，既有运行时保持不变；显式“更新版本”先展示旧/新 identity 和受影响 owner，再只修改用户确认的引用。

### 5. ZIP 是单版本传输，不是安装生命周期

角色与世界包默认包含：类型、稳定对象 identity（可选，用于更新已有对象）、选定领域版本内容、必要资源清单、资源字节和完整性摘要。它不包含完整工作区、全部历史版本、Agent transcript、测试快照、Run/Save 或内部存储元数据。

导入固定进入对应全局管理。无匹配对象时创建对象和首个版本；匹配已有对象时，用户明确选择为该对象创建新版本或另存为新对象。导入完成的有效版本立即可用于对话/互动，不再产生 installation record。

Host 授权选择和目标路径；Node adapter 在临时目录执行路径 containment、链接逃逸、重复路径、展开体积、文件数量、文件类型、manifest inventory 和 digest 校验；领域 service 校验对象事实并原子提交。任何失败仅拒绝本次操作。

### 6. 旧复杂模型原子删除且不保留数据

被替换内容包括：

- installed Character/World release contract、catalog、Root、service、repository、IPC 和测试；
- install-for-use / import-for-editing eligibility 和双确认流程；
- Adapt in Project、external adaptation provenance 和依赖替换 service；
- Project publication planning/preview；
- standalone recovery catalog、relocation 和 recovery UI；
- `installedReleaseId` 及只服务上述模型的状态、索引、资源目录和 diagnostic。

切换时一次性更新 producer、consumer、registration、fixture 和测试，然后删除旧代码与存储。新代码不得读取旧 shape、扫描旧目录、建立 migrator、dual-read、兼容 decoder、隐藏 recovery scene 或失败后 fallback。

用户已明确旧 installed/adaptation/recovery 残留数据无需保留；安装缓存、适配副本和恢复目录可删除。仍属于 canonical Project 工作区的本地对象、canonical Character/World 领域版本、对话、Room、Run、Save 及其可解析精确引用不按残留数据处理，不得误删。删除实现必须使用精确目录/记录 owner，并以测试证明不会扩大到这些 authoritative facts。

### 7. Owner 与运行边界

| Responsibility | Owner / package role | Canonical producer | Consumer | Runtime boundary | Replaced path | User-data impact |
| --- | --- | --- | --- | --- | --- | --- |
| Project 工作区 membership | `@neko/project` application + `@neko/project-node` repository | Project service | Project/Agent Webview | host-neutral + authorized filesystem | installed dependency/publication plan | 只保留本地对象与全局精确版本 ref |
| Character 全局版本与同步 | `@neko/chara` application + Chara Node adapter | Chara service | Project、Agent、Chara Webview/runtime | host-neutral + authorized filesystem | installed release/adaptation | 删除旧安装/适配残留；保留 canonical facts |
| World 全局版本与同步 | `@neko/world` application + World Node adapter | World service | Project、Agent、World Webview/runtime | host-neutral + authorized filesystem | installed release/adaptation | 删除旧安装/适配残留；保留 canonical facts |
| Assistant Creator 全局首创 | `@neko/chara` / `@neko/world` application service | Assistant-bound Agent capability after approval | 全局管理、后续互动与 Project 引用 | Agent command → owner service → repository | Project-only Creator / hidden workspace source | 直接创建全局对象和首个版本，不产生 Project 数据 |
| ZIP 导入导出 | Chara/World application + Node archive adapter | owner command after Host grant | Chara/World management | Electron path grant → Node IO → domain commit | install/import dual intents | 不持久化 archive path 或安装副本 |
| 对话与互动 | Agent/Chara/World owner | exact global version selection | Dialogue/Room/World Roots | durable runtime independent of UI Root | installed-release launch | 已有精确 canonical version ref 保持稳定 |
| Window/面板组合 | `@neko/host` + thin Desktop | sender-bound receipt | current visible package Roots | Electron Main/preload/renderer | Desktop business routing | 无领域事实写入 Shell |

`apps/neko-desktop` 仅保留必须依赖 Electron sender/window identity、原生路径授权、CSP/preload IPC 和当前可见 slot 的逻辑。任何决定同步目标、版本父子、ZIP 业务含义、运行资格或引用更新的代码都必须下沉 owning package。

### 8. Project 本地创建使用一个原子 owner 命令

“首次 durable commit 即属于精确 Project”不是通过补偿、重试 receipt 或隐藏 recovery record 实现。Project application boundary 必须在写入前验证完整的 Project authority、目标 identity、角色所需 Entity 关联和 owner payload，然后通过一个 repository transaction 提交本地 Character/World fact、Project membership，以及 Character 所需的 Entity/association facts。

任何一步失败时，本次命令不得留下未归属 CharacterProject、WorldProject、孤立 Entity、部分 association 或待重试 receipt。失败只返回当前命令的明确 diagnostic；用户修正输入后重新提交同一个 canonical create command。该约束不要求把 Chara、World、Entity 的事实 ownership 合并进 Project，transaction port 只负责同一工作区存储边界中的原子落盘。

### 9. 分批提交保持完整成功路径

本变更按以下依赖顺序提交，每批使用精确路径白名单，不吸收工作树中的无关改动：

| Batch | Owning scope | 必须完成的闭环 | 禁止夹带 |
| --- | --- | --- | --- |
| A 提案基线 | `openspec/changes/simplify-project-authoring-and-installed-libraries` | proposal、design、spec、tasks 一致且 strict validation 通过 | 应用代码、无关 OpenSpec |
| B Project Workspace | `@neko/project`、`@neko/project-webview`、必要 Chara/World workspace port、Project Node repository、最小 Desktop wiring | mutation contract、原子本地创建、全局精确引用选择/更新/移除、复制、同步、focused tests | Agent Entry、主侧边栏、独立管理布局、ZIP 重写 |
| C Portable ZIP | Chara/World contract、application、Node archive、对应 package Webview、最小 Desktop path grant | 一个 selected-version export、一个 global import、显式 target choice、staging 后原子提交、archive security tests | Project destination、installation/recovery receipt、旧 handler fallback |
| D 删除与验收 | 旧路径 owner、canonical docs、验证脚本 | 精确删除、无迁移读取测试、全量门禁、可见 UI 和适用 Agent evaluation | unrelated recovery、canonical 用户事实、顺手重构 |

Batch B 和 C 都必须原子切换本批 owning boundary 内的 producer、consumer、registration、fixture 和测试。若一个旧 producer 仍有真实 consumer，该批不得声明完成；若旧 symbol 仅剩其他活跃提案引用，必须先通过 successor disposition 明确退休或转移，不得添加 compatibility adapter。

## Risks / Trade-offs

- 破坏性删除会使旧 installed/adaptation/recovery 数据不可恢复；这是本次明确产品决策，实施前用 owner 精确清单和删除范围测试避免误删 canonical 用户事实。
- 全局并发变化时不自动合并，用户可能需要再次确认；这保持行为可预测，并避免引入 merge UI 和分支图。
- 精确版本引用不会自动获得新内容；UI 通过“有新版本”提示和显式更新减少困惑。
- 同一个工作区可能同时存在全局只读引用和本地副本；列表必须明确标注“全局引用/工作区对象”及同步关系，但不增加更多生命周期状态。

## Atomic Cutover Plan

1. 提交并校验提案基线，固定四个 delivery batch 和不可触及范围。
2. 在 Project Workspace batch 内原子完成工作区 mutation、首次归属、全局精确引用、复制与同步闭环。
3. 在 Portable ZIP batch 内把入口切到全局导入/指定版本导出，并删除同一 boundary 内的 Project import/install/adapt commands。
4. 删除 remaining installed/adaptation/recovery/publication-plan registration、store、目录和测试数据，不提供迁移或兼容读取。
5. 保持已完成的入口 Agent、运行启动和当前互动面板不变，只修复 canonical exact-version contract 的直接回归。
6. 通过 contract、repository、archive-security、Desktop/Electron、可见 UI 和 Agent runtime 验收后发布。

回滚仅允许在发布前回滚整套代码和测试。切换后不得通过重新注册旧 handler、读取旧数据或恢复 installed UI 实现运行时 fallback。

## Open Questions

无。当前实现以最短用户路径和单一 canonical model 为约束；新增远程同步、marketplace 或协作能力必须另立提案。
