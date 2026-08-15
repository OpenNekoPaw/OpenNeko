## Context

`@neko/world` 与 `@neko/world-node` 已经拥有可变 `WorldProject`、不可变 `WorldVersion`、确定性 `WorldRun` / `WorldSave` / branch、file-backed authoring repository 和 runtime-specific repository。`unify-domain-authoring-workspaces` 也已建立 standalone/project-local World authoring 共用目录 Workspace authority、Primary Main fresh empty presentation 和 Secondary Main authoring slot 的基础。

当前产品 consumer 仍存在三处职责回流：

1. `@neko/world-webview` 的 `WorldManagementRuntime` 读取包含 projects、versions、runtimes 的 `WorldFoundationSnapshot`，并可执行跨 authoring、runtime、branch 和 transformation 的 `WorldFoundationCommand`。
2. `WorldFoundationRoot` / `WorldDetailSurface` 在 management detail 中同时渲染完整 Studio 与 Runtime preview，因此管理选择被提升成编辑和运行 authority。
3. `world-preview-run-create` 使用正式 runtime service 创建 `WorldRun` / `WorldSave`，使草稿测试污染正式 runtime catalog。

这些问题不是缺少新的 World aggregate，而是 presentation/application boundary 未跟上现有 repository 拆分。继续在 Foundation Root 上增加 ZIP、Agent creator、Story、Gameplay 或 Experience 会扩大 mixed path，并与 5 个尚未实施的 World follow-up changes 重叠。

本 change 将生产第一闭环冻结为：

```text
World Management
  -> exact WorldProject
  -> Workspace World Authoring
  -> immutable WorldVersion
  -> explicit World Runtime launch
  -> WorldRun -> WorldSave / branch -> WorldView
```

完整 WorldExperience、World Story、World Gameplay、Agent Play 和 realtime presentation 不属于该闭环。

### 五层边界分析

| 层 | 结论 |
|---|---|
| 职责 | Management 负责发现和生命周期入口；Authoring 负责 WorldProject/WorldVersion；Runtime 负责 Run/Save/event/state/view。Window 只选择当前 scene 和可见 slot。 |
| 依赖 | World application 是 host-neutral；文件、ZIP 和 runtime store 只需 Node ports；只有 sender、Window、Workspace grant、native chooser 和 IPC 依赖 Desktop/Electron。 |
| 接口 | Management、Authoring、Portable Package 和 Runtime 使用四组窄 public contracts；不得继续以 Foundation mega snapshot/command 作为产品接口。 |
| 扩展 | Story、Gameplay、Experience、Agent 和 realtime provider 变化分别属于后续 owner-qualified capabilities，不扩展基础 World aggregate 或管理 DTO。 |
| 测试 | World application/codec/repository/ZIP/Skill 可脱离 Electron 验证；scene、typed IPC、授权与可见 UI 通过 Desktop/Electron 和 UI validation 验证。 |

## Goals / Non-Goals

**Goals:**

- 提供清晰、独立且唯一的 World Management、World Authoring 和 World Runtime 成功路径。
- 保持 standalone 与 project-local World authoring 使用同一 World contract/service/repository，仅 authority scope 不同。
- 保证打开 World authoring 不创建、替换或覆盖 Primary Main 的 Board/空状态。
- 保证草稿 preview 与正式 runtime 在 contract、repository、catalog 和 UI 文案上完全分离。
- 提供安全、显式、非 live-mount 的 `.neko-world` transport。
- 通过 ordinary builtin `world-creator` Skill 和 canonical Agent Entry 支持快速创建，不建立第二 Agent controller。
- 提供不依赖 AI provider 的确定性 Runtime Workbench，并为后续 Experience/Agent/realtime 保留真实 owner 边界。
- 原子删除 Foundation mixed product path，并保持现有用户 World facts 原样可见。

**Non-Goals:**

- 不实现 `WorldStoryProject`、`WorldGameplayDefinition`、`WorldExperienceProject` 或 `WorldExperienceVersion`。
- 不实现 Character Runtime composition、Agent Play、消费期 AI role、游戏引擎、World Model 或实时图片/视频/空间生成。
- 不在 Runtime 中提供连续结构改造、World authoring editor 或自动发布。
- 不把 `.neko-world` 作为 repository、sync source、mounted package、runtime package 或 Save backup。
- 不建立通用 creative aggregate、跨域 CRUD、动态 panel/plugin registry、通用 Workbench session 或第二事实来源。
- 不迁移、重写、删除或自动修复现有 World durable records。

## Decisions

### 1. 三类产品状态使用三个 owner-qualified surface contract

选择：

- World Management 是 Window navigation destination。它没有 durable management session；catalog selection、sort 和 scroll 只是可丢弃 presentation state。
- World Authoring 绑定 exact Workspace grant、placement 和 `WorldProject`，并通过 World-owned authoring service 修改 project、审核和发布 `WorldVersion`。
- World Runtime 绑定 exact `WorldVersion` launch 或 exact `WorldRun` / `WorldSave` / branch continuation。Run、Save、event 和 state 属于 World runtime owner，不属于当前 Workspace 或 mounted Root。

不采用单一 `WorldFoundationSession`，因为三类状态的创建条件、释放条件和 durable authority 不同；名称都带 World 不构成共享 owner 的依据。

### 2. 管理读取 projection，操作使用窄服务或 scene transition

`@neko/world/application` 新增 World management projection service。Producer 是现有 `WorldAuthoringCatalogPort`、`WorldRuntimeCatalogPort` 和 World reference validation；consumer 是 `@neko/world-webview` Management Root。projection 包含：

- catalog item：exact WorldProject identity、title/summary、standalone/project-local placement、review status、usable-version summary、runtime eligibility、attention/diagnostics；
- detail：identity/description、placement、lifecycle、immutable version summaries、dependency/reference diagnostics、recent runtime/save summary 和允许的 action descriptors；
- 不包含完整 mutable `WorldDefinition`、event log、WorldState、Save payload、branch payload、editor state 或 Agent transcript。

Create、Import、Export 分别调用 World-owned application service；Edit 和 Run 是 Host scene transition，必须携带 owner-issued exact target/launch receipt。删除/移除若后续提供，仍由 World owner校验引用，不进入通用 management mutation DTO。

替换路径：`WorldManagementRuntime -> OpenNekoDesktopWorldBridge.worldFoundation -> WorldFoundationCommandService` 不再是 production management path。`createWorldDurableCatalogPort` 只有存在非产品内部 consumer 时才能保留；否则删除。不得以 adapter 包裹旧 command port 继续成功。

### 3. Management UI 使用卡片目录和连续详情

`@neko/world-webview` 提供独立 `WorldManagementCatalogRoot` 与 `WorldManagementDetailRoot`。Main 默认且首期仅使用响应式卡片目录；不保留 list/grid 模式作为产品状态，除非后续有真实高密度浏览证据。

Secondary Main detail 使用一个连续背景容器和分隔线组织 identity、lifecycle、versions、references、runtime summary 和 actions。小型 stat cells 可以用于紧凑信息，但不得将每个 section 包装成独立悬浮圆角卡片。

选择 catalog item 只更新精确 selection；不得挂载 Studio、Runtime Root 或创建 Run。单条 record decode/root/reference 失败时，卡片保持可见并携带 diagnostic，sibling records 继续可用。

### 4. World Authoring 复用现有 Workspace 和 Secondary Main

canonical authoring path 保持：

```text
WorldAuthoringStudioRoot
  -> World authoring host contract
  -> sender-bound Workspace grant validation
  -> WorldAuthoringHostService
  -> WorldAuthoringService
  -> WorldAuthoringFileRepository
  -> neko/worlds/<worldProjectId>/...
```

`WorldAuthoringBinding` 原子收敛为 exact Workspace identity、grant identity、WorldProject identity 和明确 placement scope；standalone library 不再伪造 `contentProjectId`，project-local placement 必须携带 exact ContentProject identity。该 contract 保持一个 canonical shape，不增加 contract/schema version、compat alias 或 dual decoder。

Host scene composition 将 World authoring Surface 放入 Secondary Main。Primary Main 的 exact Board/View 或 canonical fresh empty presentation原样保留；World authoring open/close 只增删 Secondary Main 的 exact View 和允许的 package presentation snapshot。World package不创建 Workspace、Board 或 generic Main View。

Desktop production logic仅保留：验证 sender/window/grant，解析 Host scene command，创建 package bridge，投影可见 slot。World draft validation、placement、publication、preview 和 diagnostic 全部留在 World package；这些行为不依赖 Electron，因此不得保留在 `apps/*`。

### 5. Authoring preview 不创建 formal runtime facts

新增 World-owned deterministic authoring preview service。输入是 exact current WorldProject draft snapshot与明确测试参数，输出是 bounded、可丢弃的 preview state/view/diagnostics。它不写 runtime repository，不创建 `WorldRun`、`WorldSave`、branch、event log、recent-run、Conversation 或后台 Agent task。

现有 `world-preview-run-create` 从 authoring/management contract 删除。若 `WorldRuntimeService.createRun` 本身已经是正式 canonical launch service，则保留并仅由 Runtime launch consumer调用；不得新增 preview flag 或根据调用来源切换持久语义。

选择独立 preview contract 而不是在 `WorldRun` 上增加 test mode，因为后者会让同一 runtime identity拥有两种 persistence/catalog 语义，并产生内部多路径。

### 6. `.neko-world` 是 World-owned ZIP transport

`@neko/world/contracts` 定义严格、无内部 format version 的 manifest 和 preview/result contracts；`@neko/world/application` 决定导出成员、dependency classification、conflict 和 commit；`@neko/world-node` 只实现 ZIP stream、entry containment、size/count/digest/symlink/duplicate validation 与 atomic destination IO；Desktop Main 仅提供用户显式选择的 source/destination grant。

一个 archive 包含：

- 一个 entry WorldProject；
- 用户选择的 immutable WorldVersions；
- selected World-owned supporting records；
- exact CharacterVersion、Entity、Asset/Content 等 external dependency inventory；
- 用户显式授权嵌入的 bounded resources及其 safe relative path、media kind、length 和 digest。

默认不包含 Run、Save、branch、checkpoint、event log、Agent transcript、credentials、provider config、cache、opaque URL、runtime token 或 raw absolute path。World Save portability 若出现真实需求，必须另建 owner-qualified change，不能扩展 `.neko-world` 成混合包。

导入始终先验证和 preview，再要求 exact standalone/project-local destination authorization及无冲突确认。禁止 execute-in-place、overwrite、merge、rename、identity remap、active/current Workspace inference、archive mount/watch或失败后改写另一个目标。

### 7. `world-creator` 是普通 Skill，不是运行时协议

新增 `packages/skills/skills/world-creator/SKILL.md` 及其 metadata/catalog tests。Skill 负责创作方法：premise、scope/boundary、rules、locations、organizations、initial facts、actor/asset requirements、interaction affordances、provenance、inferences、contradictions 和 unresolved questions。

Skill 正文不得包含具体工具名、command/schema、IPC、文件路径、Workspace grant、轮询或 package authoring lifecycle。运行时 capability prompt/tool schema 负责 exact target mutation 协议。

World Management 的“快速生成”使用 typed handoff 打开 canonical Agent Entry/Composer并激活普通 `world-creator`。用户必须显式选择 standalone/project-local destination；World owner创建 fresh WorldProject和 operation-level write receipt后，Agent才可提交候选。每个候选仍由 World owner校验和用户审核。Skill、Conversation 或 model output不得自动发布 WorldVersion、启动 runtime、创建 Save、伪造 CharacterVersion ref或把推断标记为 canon。

Agent Evaluation 覆盖有证据草稿、创作/进入世界意图区分、provenance与unknown保留、unsupported capability拒绝、exact target isolation、取消前零写入和无自动 publish/run。

### 8. Runtime Workbench 是独立 scene composition

`@neko/world/contracts` 新增窄 runtime Host contract：

- launch 接收 exact eligible `WorldVersion` 和用户确认的新 Run/Save/branch identities；
- continue 接收 exact `WorldRun`、`WorldSave` 和 branch identity；
- interaction 接收 exact runtime binding、participant-scoped view identity 和 typed `WorldActionIntent`；
- snapshot/result只返回该 binding 的 WorldView、bounded state/status、available actions、event/branch timeline projection 和 diagnostics。

`@neko/world/application` 的 runtime service是 producer/authority；`@neko/world-node` runtime repository是 durable adapter；`@neko/world-webview` Runtime Root是 projection/intent adapter；Host/Desktop只授权、delegate和组合 scene。

Workbench 使用一个 owner-qualified scene，而不是 Workspace authoring View或管理 detail：

- Main：WorldView/scene interaction；
- Interaction slot：用户操作或未来 qualified Agent interaction；
- Right manager：participants、locations、state/status、available actions；
- Bottom timeline：World-owned event/checkpoint/branch projection；
- Status：exact WorldVersion、Run、Save、branch 和诊断。

该 slot集合是 World Runtime 的固定 composition，不建立动态 all-domain panel registry，也不复用 Content Cut timeline authority。离开 scene卸载 Runtime Root和昂贵 presentation resources；durable Run/Save不变，真正受保护的后台 operation由 World runtime owner继续，普通 mounted UI不构成保护条件。

完整 World Experience launch保持 unavailable。基础 Workbench必须明确标记为“基础世界运行”或等价产品语义，不得展示 Story、Gameplay、Agent或realtime capability为成功状态。

### 9. 相邻 World changes 按阶段而非并行路径处理

实施本 change 前完成一次 active-area governance：

- 本 change 接管 Foundation 第一闭环的 management、Workspace authoring、portable package、creator assistance 和 deterministic runtime UI/product composition。
- `define-world-topology-and-data-contracts` 与 `build-deterministic-world-experience-runtime` 只保留 Foundation 之外的 Story/Experience topology/runtime范围，或在无剩余范围时显式关闭；不得再次定义 WorldProject/Version/Run/Save owner。
- `add-world-interaction-surface-and-desktop-loop` 删除被本 change 接管的 Library/Studio/Foundation Runtime范围，仅在未来完整 Experience surface仍有独立需求时保留。
- `qualify-world-agent-and-realtime-capabilities` 与 `add-world-gameplay-and-agent-play-composition` 保持 gated，且不能成为基础运行的依赖。
- `define-ai-native-interactive-world` 中“生产 World Management 全部 unavailable”的条款由本 change原子收敛为“基础 World闭环在全部门禁通过后可达；完整 WorldExperience仍 unavailable”。

不得用 feature flag、registration priority或两个 scene kind 并行保留旧 Foundation UI。

### 10. Ownership、public entry 与替换矩阵

| 责任 | Owner / package role | Canonical producer | Consumer | Runtime boundary | Replaced path | User data impact |
|---|---|---|---|---|---|---|
| Management projection | `@neko/world` application | authoring/runtime catalog ports | `@neko/world-webview` management Roots | host-neutral | Foundation mega snapshot | 只读 projection，可重建 |
| Authoring contract/service | `@neko/world` contracts/application | WorldAuthoringService | Studio、Agent authoring provider | host-neutral | Foundation command subset/filter | 原文件原子写入，不迁移 |
| World files | `@neko/world-node` L1 adapter | WorldAuthoringFileRepository | World application | authorized filesystem | SQLite/implicit root成功路径 | 旧 bytes保留，不fallback |
| Preview | `@neko/world` application | deterministic preview service | Studio preview Surface | host-neutral/in-memory | formal Run creation for preview | 不产生 durable facts |
| Portable package | World contract/application + world-node adapter | package service/archive adapter | Management import/export | native file authorization | ad hoc directory/ZIP handling | 只在显式确认后写目标 |
| Creator assistance | `@neko/skills` + Agent runtime + World capability | builtin Skill / exact target provider | Agent Entry | Agent task + owner write receipt | embedded management Composer | fresh target以外零写入 |
| Runtime | World contract/application + world-node | runtime service/repository | Runtime Root | durable local runtime | management detail preview commands | 保留 Run/Save/branch |
| Scene/IPC | `@neko/host` + thin Desktop composition | Host scene and sender-bound adapters | Renderer package Roots | Electron boundary | world-foundation catch-all bridge | 不持有 World facts |

## Risks / Trade-offs

- [现有 Foundation contract被多个测试/fixture消费] → 先建立窄 producer/consumer tests并原子切换全部 registration、preload、renderer和fixtures；随后删除或 poison旧 bridge，禁止adapter fallback。
- [active World changes定义了重叠产品范围] → tasks第一阶段先完成逐项 ownership/spec对账；未完成前不得实现production path。
- [preview从formal Run分离会减少复用] → 只复用纯 deterministic reducer/validation primitives，不复用 runtime identity、repository或catalog side effect。
- [World Management加入runtime summary可能再次变成mixed authority] → management service只投影bounded summary和exact navigation action，不返回WorldState/event/save payload，也不接受runtime mutation。
- [portable resource依赖跨Asset/Content/Character owner] → 默认输出external inventory；只有owner明确授权且package contract声明的resource可以嵌入，不复制其他owner facts。
- [Runtime Workbench被误解为完整WorldExperience] → 产品命名、capability status、diagnostics和acceptance tests明确“基础确定性运行”；Story/Gameplay/Agent/realtime controls不存在而非disabled mock。
- [非全屏布局再次挤压/裁切] → UI inventory覆盖管理Main、Secondary detail、authoring Secondary和runtime各slot的narrow viewport；使用单一slot scroll owner和minimum sizes，不引入嵌套全高滚动卡片。
- [删除mixed path影响已有World records可达性] → 新projection分别读取canonical authoring/runtime ports；单条失败逐项诊断，现有bytes不迁移、不清理、不隐藏。

## Migration Plan

1. 先对账并更新重叠World OpenSpecs，冻结唯一第一闭环和高级capability gates。
2. 在`@neko/world`增加management、preview、portable和runtime窄contracts/services及producer tests；不接触Desktop。
3. 在`@neko/world-node`实现portable archive和必要的repository窄adapters，验证untrusted ZIP与现有facts保持。
4. 将`@neko/world-webview`拆为Management Catalog/Detail、Authoring Studio和Runtime Roots；删除detail内嵌Studio/Preview。
5. 原子更新Host scene、preload typed bridges、Desktop composition、fixtures和consumer tests；删除Foundation product bridge/registration和旧成功路径。
6. 添加`world-creator` Skill、typed handoff、capability/evaluation evidence。
7. 运行package、architecture、Desktop/Electron、UI与Agent Evaluation gates；只有基础闭环全部通过后才把其capability标记为available，完整WorldExperience继续unavailable。

回退仅允许回退尚未发布的代码提交，不能在运行时恢复旧Foundation adapter作为fallback。若发布后发现问题，保持World records可见并将受影响operation局部置为diagnostic/read-only，随后roll forward修复canonical path。

## Open Questions

- 首期 Runtime Workbench 是否仅支持单个用户participant，还是暴露现有contract已经稳定支持的多个participant view切换；实施前以当前World runtime authoritative contract和真实consumer为准，不预建participant registry。
- `.neko-world` 首期允许嵌入哪些World-owned supporting records；实现前需列出真实producer/consumer，未被证明为World-owned的资源一律保留为external dependency。
- World runtime event timeline首期是否需要checkpoint手动操作；若没有真实用户流程，只显示已提交projection，不增加命令。
<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-14):** Standalone mutable placement and management quick-generation decisions below are historical context only and MUST NOT receive new production work. World owner boundaries, archive validation, authoring/runtime separation, and exact runtime identity remain applicable.
