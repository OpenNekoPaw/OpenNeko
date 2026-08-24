## Why

World Foundation 已经具备 `WorldProject -> WorldVersion -> WorldRun -> WorldSave/branch` 的最小事实链和独立 authoring/runtime repositories，但当前产品表面仍通过一个 Foundation snapshot、command port 和详情页混合管理、编辑、预览与运行；打开 World authoring 还可能替换 Workspace Primary Main 的 Board/空状态。需要在继续扩展完整 World Experience 之前，先把基础 World 的产品生命周期、Workspace 组合、可移植传输和 Agent 辅助创作收敛成一条可验证的 canonical path。

## What Changes

- 将 World 产品能力明确拆分为轻量 World Management、目录授权的 World Authoring，以及从精确不可变 `WorldVersion` 启动的确定性 World Runtime；三者分别拥有 presentation、facts、identity 和释放条件。
- **BREAKING**：移除 World Management 对通用 Foundation snapshot/command 成功路径的依赖。管理页只消费 World-owned catalog/detail projection，并只通过精确 owner transitions 进入创建、编辑、导入、导出或运行；不再内嵌完整 World Studio、事件编辑、Save/branch 操作或运行预览。
- World Management 默认使用与其他入口一致的卡片目录和连续分区详情，不使用列表优先、嵌套悬浮卡片或跨域通用 mutable item DTO；单条失效记录保持可见并 fail-local。
- 复用现有 Workspace authority、World authoring service、file repository 和 `WorldAuthoringStudioRoot`。World authoring 打开在 Secondary Main，Primary Main 始终保留其 canonical Board 或 fresh empty presentation；关闭 authoring 恢复同一 Primary Main，不创建或覆盖 Board。
- 将草稿测试定义为 authoring-owned、可丢弃的 deterministic preview，不创建正式 `WorldRun`、`WorldSave`、branch、recent-run 或 Agent runtime。正式运行只能从精确、可运行的不可变 `WorldVersion` 显式启动。
- 新增严格 `.neko-world` ZIP transport：导出一个 WorldProject、用户选择的 WorldVersions、显式依赖清单和经授权嵌入的资源；默认排除 Run、Save、branch、event log、Agent transcript、凭据、缓存、raw path 和 runtime handle。导入必须先校验和预览，再写入一个精确授权、无冲突的 standalone 或 project-local destination。
- 新增 builtin `world-creator` Skill 与 typed Agent Entry handoff，用于提出有来源、可审核的 World draft candidates；它复用 canonical Agent Composer、exact fresh WorldProject destination、World owner capability 和标准 approval，不建立第二 Agent controller，也不自动发布、运行或创建 Save。
- 新增基础 World Runtime Workbench，围绕精确 `WorldRun` / `WorldSave` / branch 投影 WorldView、typed action、state/status 和 event timeline；离开场景卸载 Renderer Root，但不修改 durable records 或受保护后台 runtime。
- 保留完整 World Story、Gameplay、WorldExperience composition、Agent Play、realtime image/video/spatial provider 和连续运行期结构改造为后续 gated capabilities。本变更不会用基础运行表面伪装完整 World Experience ready。
- 对账并关闭未实施的重叠 Foundation 与未来 gated World proposals：本变更接管 Foundation 第一闭环的管理/authoring/runtime product path；高级 Experience/Story/Gameplay/Agent/realtime 方向仅由 `ROADMAP_CN.md` / `ROADMAP.md` 的晋级门槛承载，继续保持 unavailable，未来出现真实用户证据时必须建立新的 focused OpenSpec，禁止并行实现重叠 owner、contract、repository、scene 或 Webview Root。

## Capabilities

### New Capabilities

- `world-management-authoring-experience`: World Management、快速/手动创建、目录 Workspace authoring、可用版本与引用诊断，以及管理/创作/正式运行的生命周期分离。
- `world-portable-package`: `.neko-world` ZIP 的导出范围、严格 manifest、依赖与资源清单、非可信导入校验、预览、冲突和目标授权语义。
- `world-creator-assistance`: builtin `world-creator` Skill、Agent Entry typed handoff、fresh target authorization、候选审核边界和行为 Evaluation 要求。
- `world-runtime-workbench`: 从精确 `WorldVersion` 启动或继续确定性 WorldRun/Save/branch 的独立 Workbench、typed interaction、投影、场景释放和 fail-local 语义。

### Modified Capabilities

- `desktop-creative-workbench-layout`: 明确 World Management 与 Workspace World Authoring 的 Main/Secondary Main 组合，要求 authoring 保留 Primary Main 的 canonical Board/空状态，并将正式 World Runtime 作为独立 scene composition 而非 authoring 或 management detail。

## Impact

- Owning responsibilities：`@neko/world` contracts/application 拥有 World management projection、authoring、publication、preview 与 runtime orchestration；`@neko/world-node` 拥有 authorized file repository、runtime repository 和 portable archive adapter；`@neko/world-webview` 拥有 Management、Studio 与 Runtime package Roots；`@neko/skills` 拥有普通 builtin `world-creator` Skill content；Agent runtime 继续拥有 Draft/Conversation/Turn/approval；Host/Desktop 只拥有 sender-bound grant、typed IPC、Window scene 与可见 slot composition。
- Canonical paths：沿用唯一 `WorldProject -> WorldVersion` file authoring/publication path和唯一 `WorldVersion -> WorldRun -> WorldSave/branch` runtime path；不引入 `WorldExperienceVersion` compatibility union、SQLite authoring fallback、active/current Workspace inference、第二 repository 或第二 Agent controller。
- Replaced paths：替换 `WorldFoundationRoot` 作为管理/编辑/运行混合产品 Root 的成功路径，以及 `WorldManagementRuntime.execute(WorldFoundationCommand)` 的跨生命周期命令入口；Foundation domain services 可保留为内部组合来源，但产品 consumer 必须使用窄 public entries。
- Desktop boundary：`apps/neko-desktop` 仅更新 World scene/slot wiring、preload typed port 和 native authorization adapter，不保留 host-neutral World business decisions。任何 World mutation、publication、portable-package policy、preview/runtime creation 和 diagnostics 必须委托 package public application entry。
- User data：现有 WorldProject、WorldVersion、WorldRun、WorldSave、event 和 branch bytes 保留且不自动迁移、覆盖、删除或修复；失效记录在最小 owner scope 内保持可见。`.neko-world` 是显式 transport，不成为 live repository、mount、watcher、recent-package authority 或 runtime identity。
- Validation：涉及 `@neko/world`、`@neko/world-node`、`@neko/world-webview`、`@neko/host`、Desktop scene tests、UI validation、Agent Evaluation、portable archive security tests 与 architecture/unused/no-internal-versioning gates。
<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-14):** World Management quick generation, standalone mutable authoring, and ambiguous standalone/project-local editing import are retired. The successor keeps Project management direct creation, Project-bound Agent Skill creation, immutable installed World releases, adaptation, recovery, and exact runtime launch.
