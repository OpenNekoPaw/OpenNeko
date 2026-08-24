## Context

Character/World 已有完整领域 package、Desktop IPC、Workbench Surface、Agent launch binding、builtin Skill
与 DSH Tool bundle。产品现在需要在发行包中隐藏这些能力，但 Development 必须继续走原 canonical path。
这不是第二套业务实现：发行差异只决定 contribution 是否进入当前产品 composition；领域 owner、contract、
数据 authority 和成功路径保持唯一。

## Goals / Non-Goals

**Goals:**

- 一个 Main-owned distribution fact 同时决定 Host capability、Renderer entry、DSH bundle 与 builtin Skill 资源。
- Release 的可见入口与直接调用都不可达，不能靠 CSS 或按钮隐藏伪装。
- Development 不改变 Character/World 的 owner、contract、Tool、authoring 和 runtime 路径。
- 保留所有 durable records 和领域实现；只清理可丢弃 presentation。

**Non-Goals:**

- 删除、迁移、归档或转换 Character/World/Conversation 数据。
- 重构 Character/World 领域模型、authoring、runtime、portable 或 IPC contract。
- 提供用户可切换的实验开关、远程 feature flag、环境变量 override 或新旧实现并行路由。
- 把 Release 隐藏状态解释为 Character/World 已废弃。

## Decisions

### 1. `app.isPackaged` 是唯一发行组合输入

Desktop Main 在 Application composition boundary 读取 Electron `app.isPackaged`。未打包进程为
Development composition；打包应用为 Release composition。该事实只在组合根转换为
`experimentalCreativeCapabilitiesReady` 与 DSH/resource composition input。Renderer、Webview、领域 package
和 tests 不读取 `NODE_ENV`、Vite mode、命令行或用户配置。

这不是运行时 feature flag：用户不能切换，单个应用进程只组成一套 capability graph，且两种组合复用同一
Character/World 实现。Release 中没有替代 handler、fallback owner 或兼容成功路径。

### 2. Host capability projection 是 Renderer 唯一展示 authority

`@neko/host` 的 `DesktopShellService` 接收组合根注入的 boolean，并将 `character` / `world` surface 投影为
`ready` 或 `unavailable`。Renderer 仅按该 projection 决定：

- Primary Sidebar Development experimental group 与 Conversation history 中的 Character/Room records；
- Agent Entry experimental Character/World context；
- Project Workspace 的 Character/World mutation/open controls；
- Resource Browser 的 Character creation contribution。

Development 的 projection 为 ready，现有入口和 canonical handler 不变。Release 的 projection 为
unavailable，UI 不渲染入口；Renderer 不根据 `window`、构建常量或 URL 推断模式。

Primary Sidebar 的展示层级不复制该 capability authority：Start Creating、Projects、Works、Asset Library 与
Extensions 是固定一级目的地，保持直接平铺；Development 只把 Character/World 放入带明确标签的实验分组。
Conversation history 使用一个可滚动分组，并按 Project、Assistant、Character/Room exact owner 排列现有
group；Release 过滤 Character/Room group，Development 只在存在真实记录时展示，World 不制造空 history
section。分组和排序均为可丢弃 Renderer presentation，不创建统一 Conversation owner、导航 registry 或
durable state。

### 3. Host 在最小 Scene boundary 拒绝隐藏能力

UI 隐藏不能作为调用授权。`DesktopShellService.transitionScene` 在 project/workspace resolution、runtime
创建或 presentation mutation 之前识别 Character/World-owned intents：management、detail、authoring、
World runtime，以及 Character/Room/World conversation restore。Release 返回
`desktop-scene-owner-unavailable`，metadata 携带 exact owner 与 intent；sibling Agent、Project、Asset 和
Extension Scene 不受影响。

恢复持久窗口时，Release 将 Character management、World management、Character interaction 与 World
runtime presentation 重置为新的 unbound Agent Entry，并记录 `desktop-presentation-reset`。只重置 Window
presentation；durable records、transcript、task/runtime 和项目事实不变。Development 不执行该重置。

### 4. Agent Entry 保留 Project authoring，实验上下文按 composition 注入

`@neko/agent-webview` 的 Entry context 分为稳定的 Workspace/Project selector 与可选的
`experimentalCreative` selector。Development 注入 Character/World loaders，保持 Dialogue/Room/World
launch binding。Release 不注入该字段，因此 Conversation Entry 没有 Character/World context action、selector
或 binding chip；Creation 仍可选择 Project。

缺失 experimental context 是 Release 的 canonical composition，不触发 fallback、空 target catalog 或
隐式 Assistant downgrade。已有 Character/Room transcript 不被删除，但 Release 的 Scene restore 在 Host
边界显式不可用。

### 5. Release profile 和资源闭包不包含可执行贡献

DSH profile template 继续描述完整 Development bundle graph。materializer 在 Release composition 中生成
同一 canonical manifest shape，但原子移除 `@neko/chara-dsh-plugin` 与 `@neko/world-dsh-plugin`，并且不为
它们创建 profile symlink；Development 保留两项。不存在加载失败后试探或第二 profile。

Forge 的 Release resource copy 从 builtin Skill source root 排除 `character-creator` 与 `world-creator`；
Development 直接读取 source root，因此继续发现两项。领域 Skill 文件与 DSH package 源码保留在仓库，
Release executable catalog 无法发现它们。

macOS Forge 签名必须保留已验证 DSH payload 内 Node 与 native executable 的原签名字节，并只签名外围 App
bundle 与 DSH closure 外的 Electron runtime。否则签名阶段会改变 `payload/bin/node`、Sharp、libvips、Koffi、
ripgrep 与 node-pty native bytes，使打包前生成的 DSH checksum 与 closure fingerprint 失效。精确 ignore 只匹配
canonical `dsh-runtime/darwin-arm64/payload/` resource path；descriptor、相似路径和其他 binary 仍进入 Forge 签名。

### 6. Project records 可见但能力不可执行

Release 的 Project Workspace 可以继续显示已持久化 Character/World item 的名称、状态与 diagnostic，避免把
项目事实伪装成不存在；但不显示 add-reference、copy、update、synchronize 或 open controls。Resource
Browser 不接收 Character creation contribution。直接调用 Project open callback 也根据 Host capability
projection fail visibly。Development 行为保持不变。

## Ownership and Runtime Path

| Responsibility                            | Owner / public entry              | Producer                        | Consumer                      | Boundary             | Replaced path                           |
| ----------------------------------------- | --------------------------------- | ------------------------------- | ----------------------------- | -------------------- | --------------------------------------- |
| Distribution fact                         | Desktop Main composition          | Electron `app.isPackaged`       | Host/DSH/resource composition | Electron Application | scattered Renderer/build inference      |
| Capability projection and Scene gate      | `@neko/host` Desktop Shell        | Main-injected composition input | Renderer + typed Scene caller | host-neutral service | UI-only hiding                          |
| Entry presentation                        | `@neko/agent-webview` public Root | Desktop renderer adapter        | Agent Entry user              | Renderer/Webview     | mandatory Character/World Entry context |
| Project read-only capability presentation | `@neko/project-webview`           | Project/Host projection         | Workspace user                | Webview              | always-on mutation/open controls        |
| DSH executable contributions              | Desktop DSH profile materializer  | Development/Release input       | DSH Cordis loader             | Node subprocess      | always-loaded Character/World bundles   |
| Builtin Skill resources                   | Forge Release resource copy       | repository Skill packages       | DSH SkillHost                 | package filesystem   | all-source-directory release copy       |

Desktop-only logic retained in `apps/*` depends on Electron packaging, resource paths, Forge packaging and DSH process
composition. Character/World availability policy and transition semantics remain host-neutral in `@neko/host`.

## User Data Impact

- No Character, World, Project, Conversation, transcript, artifact or version record is written, migrated or deleted.
- No filesystem package in the development workspace is removed.
- Release may discard only Character/World Window presentation snapshots and records a visible local diagnostic.
- Protected background tasks remain owned by their exact runtime; hiding the React/Scene entry does not cancel them.

## Risks / Trade-offs

- Existing Release users cannot open hidden historical Character/World records through the normal product UI; records remain
  intact for a later promoted release or Development build.
- Packaging filters and DSH materialization must stay aligned; closure tests poison either Skill or Tool contribution leaking
  into Release.
- `app.isPackaged` treats locally packaged QA builds as Release. This is intentional so QA validates the shipped surface;
  Character/World development uses the unbundled Development runtime.

## Evaluation Decision

Update `agent-runtime.launch-binding`: deterministic and visible Desktop cases must prove Development preserves exact
Character/World target selection while Release exposes neither context action and rejects direct owner-qualified Scene
transitions. Existing `skill.character-creator` and `skill.world-creator` suites remain development-owner evidence and are
not claimed as Release capabilities. No new provider-backed quality case is required because the model-visible behavior in
Release is absence, verified by executable catalog and no-fallback evidence rather than generated content quality.
