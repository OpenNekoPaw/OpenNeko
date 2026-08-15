## Why

当前实现把角色和世界拆成工作区草稿、领域版本、installed release、项目适配和恢复目录等多层身份。用户为了创作、复用或开始互动，需要在“安装、导入、适配、发布、恢复”之间理解实现细节；同一角色或世界也可能同时拥有多套目录和生命周期。

产品只需要区分两件事：工作区中的可编辑对象，以及可被所有项目和互动精确引用的全局版本。角色和世界应采用同一套最小模型；ZIP 只是导入导出的传输格式，不再产生安装生命周期。

## What Changes

- 保持 Desktop 左侧主侧边栏和既有管理页面不变；入口 Agent 只显示“对话”和“创作”。
- “创作”选择一个精确 Project 后只把它加入 Composer 上下文栏，不直接进入项目；Project 对应一个通用 Creative Workspace，可同时包含内容、工作区角色和工作区世界。
- 同一 `character-creator` / `world-creator` Skill 可在两种明确 authority 下使用：创作模式绑定 Project 时创建工作区角色/世界；助手模式未绑定 Project 时，经用户确认后直接创建全局角色/世界及首个不可变版本。
- 工作区可以新建本地角色/世界，也可以加入全局角色/世界的精确版本引用。全局引用默认只读；需要编辑时复制为新的工作区对象。
- 工作区角色/世界通过“同步到全局”创建全局对象或为已有全局对象创建不可变的新领域版本。同步不覆盖历史版本，不自动合并，不自动更新任何既有引用。
- 全局角色和世界不区分草稿、发布、安装或适配状态。任一有效全局版本都可直接使用；管理页仅突出当前版本并保留历史版本选择。
- 对话使用全局角色的精确版本：角色可多选、世界可单选，并可同时选择。一个角色进入 Dialogue，多个角色进入 Room；选择世界后进入 World Experience。
- 工作区和运行时始终保存精确全局版本引用。全局产生新版本后，既有 Project、Dialogue、Room、Run 和 Save 保持旧版本，用户显式确认后才更新引用。
- 角色和世界均支持 ZIP 导入导出。导入固定进入对应全局管理并立即形成可用版本；导出只包含一个选定版本及必要资源，不携带工作区历史或完整版本图。
- **BREAKING** 删除 installed release、install-for-use、import-for-editing 双意图、Adapt in Project、项目级 publication plan、standalone recovery catalog 及其额外身份、状态、界面和成功路径。
- **BREAKING** 新模型不读取、不迁移、不恢复旧 installed/adaptation/recovery 残留数据。实施时删除对应存储、索引和资源目录；用户明确保留的工作区对象和 canonical 领域版本不属于残留数据。

## Delivery Strategy

本变更按四个可独立审查的提交批次交付，不按页面或文件数量拆分。每个代码批次必须在自己的 owning boundary 内同时更新 contract、producer、consumer、fixture 和测试，不得提交只增加新路径但继续保留旧成功路径的过渡状态。

1. **提案基线**：只提交本变更的 proposal、design、spec 和 tasks，冻结产品边界、删除范围、批次顺序与验收命令。
2. **Project Workspace 闭环**：只修改 Project、Project Webview、Chara/World workspace application port 及必要 Desktop wiring；完成精确全局引用的添加、更新、移除、复制到本地、同步到全局，并把本地角色/世界创建收敛为首次 durable commit 即属于精确 Project 的原子命令。该批次不修改入口 Agent、主侧边栏或独立管理页面。
3. **全局单版本 ZIP**：只修改 Chara/World portable contract、application service、Node archive adapter、对应管理入口与必要 Desktop path-grant wiring；原子替换 Project-bound import/install/adapt 路径，不保留平行 `previewImport` / `commitImport` 成功语义。
4. **旧路径删除与验收**：删除 installed/adaptation/recovery/publication-plan 的剩余 registration、store、fixture、resource directory 和 UI 入口，更新 canonical 中英文文档，并执行质量、可见 UI 和 Agent 验收。

入口 Agent 与互动组合已经完成并冻结。后续批次不得借工作区或 ZIP 实现继续调整 Conversation/Creation 选择器、Composer 上下文栏、当前会话 manager dock、主侧边栏或其他管理布局；只有发现与本提案 canonical contract 直接冲突的缺陷时，才允许在相应 owner 的独立修复提交中处理。

## Capabilities

### New Capabilities

- `global-character-world-catalog`: 定义角色/世界一致的全局对象、不可变用户领域版本、工作区同步和精确引用。
- `portable-character-world-package`: 定义单版本角色/世界 ZIP 的安全导入导出。

### Modified Capabilities

- `conversation-creation-entry-model`: 对话只选择全局精确版本；创作只选择 Project 并保留 Composer 上下文栏。
- `project-scoped-domain-authoring`: 工作区统一承载本地对象和全局精确版本引用，以“同步到全局”替代复杂发布与适配。
- `desktop-creative-workbench-layout`: 保持既有侧边栏与管理场景，只组合入口 Agent、通用工作区和当前互动 owner 的辅助面板。

### Removed Capabilities

- `installed-character-world-libraries`: 不再存在独立安装记录和 installed release 身份。
- `installed-release-project-adaptation`: 不再存在从安装版本适配到项目的中间流程。

## Impact

> SUCCESSOR: simplify-project-authoring-and-installed-libraries
>
> Successor disposition (2026-08-15): This change is the canonical replacement boundary for
> `refine-character-management-authoring-and-version-graph`,
> `refine-world-management-authoring-and-runtime`,
> `separate-companion-and-narrative-character-conversations`,
> `simplify-resource-entity-character-world-boundaries`, and
> `unify-domain-authoring-workspaces`. Their standalone authoring, installed/adaptation,
> recovery, publication-plan, and conflicting entry semantics are historical and are not
> reintroduced here; retained domain facts and runtime contracts are consumed only through the
> exact global/workspace model defined by this change.

- `@neko/chara` 与 `@neko/world` 分别拥有全局对象、领域版本、工作区对象、同步规则、ZIP 语义和运行资格；两者使用同构契约，不共享可变事实仓库。
- `@neko/agent-*` 根据精确 Project-bound 或 Assistant-bound authority 暴露对应 Creator command；助手快创只提交全局 owner command，不创建隐藏 Project、工作区对象或同步链路。
- `@neko/project` 只拥有 Project、工作区成员关系、工作区本地对象引用和全局精确版本依赖，不复制角色/世界事实。
- `@neko/agent-*` 只持有精确 Project 创作上下文或精确全局版本运行上下文，不解析 current/latest/name。
- `@neko/host` 与 `apps/neko-desktop` 只负责 sender/window/path 授权、typed IPC 和可见 Root 组合；同步、导入、版本创建和运行资格仍由领域 owner 决定。
- `@neko/chara-node` 与 `@neko/world-node` 提供本地仓库和 ZIP 边界 adapter。ZIP 继续执行路径穿越、链接逃逸、体积、文件数量、类型、清单和完整性校验。
- 此次替换是破坏性本地模型收敛：旧 installed/adaptation/recovery 数据可直接删除，不建立 migrator、兼容 decoder、dual-read、隐藏恢复入口或 fallback。
