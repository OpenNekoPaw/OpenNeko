> Composition reconciliation (2026-08-12): project-local Character creation additionally commits the
> Project-owned exact Entity/CharacterProject association defined by
> [`simplify-resource-entity-character-world-boundaries`](../simplify-resource-entity-character-world-boundaries/).
> Chara remains the only CharacterProject repository; manual, prompt, file, Asset and Entity seeds cannot
> create parallel Character types.

## Why

当前 Character 管理页把目录浏览、快速新增、完整角色设定编辑和本地版本发布叠在同一个 Main/Secondary Main 场景中；同时 CharacterVersion 只有时间排序列表，无法表达从任意历史版本继续创作产生的多分支关系。用户因此难以判断自己是在管理角色、创作草稿、创建本地可用版本，还是执行共享/服务端发布。

## What Changes

- **BREAKING**：将 Character Management、快速新增、Workspace Character Authoring 和 Character Interaction 明确拆为不同能力与生命周期。管理页 Secondary Main 默认只显示角色归属、摘要、草稿/可用版本状态与主要操作；版本关系、故事线、引用和破坏性管理进入 Workspace Character Authoring 的高级区域，不再挂载完整 Character 编辑表单或把内部领域清单暴露为管理首页内容。Character Studio 只作为 Workspace Authoring 对精确 CharacterProject 的 Chara-owned Main surface，不再被设计为独立应用、独立 Workspace 类型或第二套 authoring runtime。
- 在角色管理页提供“快速生成 / 手动创建 / 导入”入口。快速生成通过 typed handoff 打开 canonical Agent Entry/Composer 并激活唯一 `character-creator` Skill，继续使用标准 operation-level destination chooser、精确 fresh CharacterProject 和 Tool approval；不在管理页复制 Composer/模型配置，不增加 Chara 专用模型执行路径，也不强制进入 Studio。
- Character authoring 直接作为 Host 授权目录型 Authoring Workspace 的领域能力运行：standalone Character 使用角色库管理的 Workspace authority，project-local Character 使用 Content Project Workspace authority；两者绑定同一个精确 CharacterProject，复用 Workspace target switching、Workbench composition、Agent/资源能力以及相同 Chara surface、service、codec、repository 和 publication path。Character authoring 不把 standalone Character 伪装成 Content Project，也不创建 Chara 专用 Workspace/controller，不从当前/最近目录推断 authority。
- 定义一个可移植的 `.neko-character` ZIP 角色包，只作为用户显式触发的导入/导出容器。包内使用 manifest 描述入口 CharacterProject、包含的用户领域版本/故事线、素材清单、外部依赖和完整性信息，并携带 canonical Character records 与用户明确选择内嵌的角色自有素材。导出生成一次性快照；导入完成后关闭归档并只使用已安装的 Workspace 目录记录，绝不保留 ZIP 绑定、挂载、监听、同步、编辑或运行路径。包不包含 Conversation、Room、长期记忆、provider/model 配置、凭据或运行状态。
- Workspace 内的 canonical live format 继续是 `neko/characters/<characterProjectId>/...` 目录记录集：metadata/草稿、不可变 CharacterVersion、lineage、Storyline、authoring test 和本地化素材绑定由 Chara 拥有；形象、Live2D、VRM、音频等默认保存 opaque asset refs，只有用户显式“本地化/打包素材”时才复制到角色自有 assets 范围，并以 canonical binding 把 exact opaque ref/representation 关联到入口文件和所属文件清单。禁止把 raw absolute path、ZIP manifest 或任意外部素材静默装入角色包或在导入后依赖临时 manifest 解析本地素材。
- 将用户可见“发布版本”改为“创建本地可用版本 / 定稿”，明确 CharacterVersion 是本地不可变领域快照，不代表上传、共享、市场发布或云同步。导出和远程共享保留为未来独立 workflow。
- 为 CharacterVersion 增加用户可见 lineage authority，支持根版本、从历史版本派生、多个分支头、版本图、精确比较、从历史版本继续创作和引用保护；运行时、Storyline 和 Project dependency 继续引用精确 CharacterVersion，禁止通过时间或名称选择“最新版本”。
- 第一阶段保留每个 CharacterProject 一个工作草稿；允许从任意历史版本切换草稿基线并产生分支，不引入多个并行工作草稿、自动合并或 Git 式通用分支系统。
- 明确区分 CharacterVersion lineage、CharacterStoryline node graph 和 Agent Conversation branch。三者分别拥有 identity、owner、UI 和引用关系，不合并为统一 Timeline 或版本图。
- 补充 standalone/project-local 归属、project-local fact 与 external CharacterVersion dependency 的可见标签和来源 handoff；项目本地角色不进入 standalone catalog，全局版本引用在项目中保持只读。
- 既有无 lineage 的 CharacterVersion 必须保持可见和可引用，并显示为来源未声明的独立节点；不得按发布时间、文件顺序、label 或 current draft 静默推断父子关系。

## Capabilities

### New Capabilities

- `character-management-authoring-experience`: 定义 Character Management、快速新增、Workspace Character Authoring capability、本地可用版本术语、standalone/project-local 归属和管理/创作/运行边界。
- `character-portable-package`: 定义 Workspace live directory record 与 `.neko-character` ZIP transport package 的边界、manifest/inventory、素材 ownership、导入校验以及不得打包的运行时和敏感数据。
- `character-version-lineage`: 定义用户管理的 CharacterVersion 来源图、单工作草稿基线、分支头、比较、引用、删除保护和既有无关系版本的可见处理。

### Modified Capabilities

- `desktop-creative-workbench-layout`: 要求 Character Management 只在 Main/Secondary Main 组合目录与只读详情；Workspace Authoring 在精确目录授权和 AuthoringTarget 下组合 Chara-owned Character surface，不得把完整编辑器保留在管理 detail slot，也不得创建独立 Character Studio Scene/Workbench/controller。

## Impact

- Owning responsibility：`@neko/chara` 继续唯一拥有 CharacterProject、工作草稿、CharacterVersion、版本 lineage、Storyline、角色包 manifest/inventory、引用校验和 authoring/import/export workflow；素材 bytes 仍由 Asset/Host authority 拥有，只有显式本地化后的角色自有副本进入 Chara package scope。`@neko/agent-runtime` 继续拥有 `character-creator` 的 Conversation/Turn/Skill/Tool approval 生命周期；`@neko/host` 拥有目录 grant、归档文件授权、精确 authoring target 和 Window Scene；`@neko/project` 只拥有 project-local membership 与 external immutable dependency ref。Desktop 只组合 typed ports、Scene 和可见 package Roots。
- Package roles：`@neko/chara/contracts` 增加用户领域 lineage、portable package manifest/inventory contract 和 Character authoring surface input/output；`@neko/chara/application` 增加 lineage、draft-baseline、compare/reference 与显式 import/export workflow；`@neko/chara-node` 保持唯一目录型 authoring repository，并实现受限 ZIP reader/writer；`@neko/chara-webview` 提供管理详情、导入预检与可由 Workspace 组合的 Character authoring surface、版本图和 compare UI；`@neko/agent-*` 只扩展既有 `character-creator` 的管理页 handoff/projection；`apps/neko-desktop` 只做 Host/file authorization adapter 和 Workspace composition wiring。
- Runtime boundary：Renderer 不接收 raw path、ZIP path 或直接访问目录；Studio 消费 sender-bound Workspace grant 和 exact CharacterProject binding。导入先在 Host/Node 边界把归档校验为有界临时 bytes，再通过 Chara application 显式写入授权 Workspace并释放归档资源；后续管理、创作、对话与 Room 只读取 canonical Workspace records，不得回读、挂载、监听、同步或从 ZIP 原地运行角色。Character Dialogue/Room 只消费 immutable exact CharacterVersion，不读取工作草稿或推断 branch head。
- Replaced paths：移除 Character Management detail 中成功挂载完整 `CharacterPanel` 的路径、独立 Character Studio Scene/Workspace/controller、管理页独立 AI 角色生成设想、用户可见服务端含义的“发布”文案、按时间排序代替 lineage 的版本选择语义，以及任何 latest/current/active version fallback。
- User data：现有 CharacterProject、CharacterVersion、Storyline、Conversation、Room、memory provenance 和 Project dependency 均保留。无 lineage 的既有版本作为独立节点显示明确状态；不得重写 immutable publication、伪造父版本、自动迁移引用或清理历史记录。导入冲突必须在 exact target 上预检并要求用户明确决定，禁止覆盖现有记录或把包内 identity 静默绑定到当前角色。
- Adjacent changes：实现必须与 `unify-domain-authoring-workspaces` 的目录 authority/Studio 路径、`separate-companion-and-narrative-character-conversations` 的 exact CharacterVersion runtime 和 `unify-skill-creator-authoring-targets` 的 operation-level chooser 保持一条 canonical path，不复制其 contract 或 handler。
<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-14):** Character Management quick generation, standalone mutable authoring, and ambiguous standalone/project-local editing import are retired. The successor keeps Project management direct creation, Project-bound Agent Skill creation, immutable installed Character releases, adaptation, and recovery.
