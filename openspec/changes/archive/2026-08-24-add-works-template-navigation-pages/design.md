## Context

当前主导航只有 `content-projects | characters | worlds` 三种 Creative Management catalog。作品没有全局 publication catalog，模板只有开始创作页已经定义的三组本地化快速创作内容。Renderer 若用组件状态模拟两个页面，会绕开 Host-owned Window Scene；若把 Project 或当前打开 View 投影成作品，则会制造错误事实来源。

### Five-layer analysis

- **Responsibility:** `@neko/host` 拥有 Window Scene identity、transition 和 codec；Desktop Renderer 只组合导航与静态管理 presentation。Project、Agent、Assets 仍拥有各自事实。
- **Dependency:** Host contract 保持 L0/host-neutral；Renderer 只依赖 public Host contract、React 和 `@neko/ui`，不访问 Electron、Node 或 Workspace 路径。
- **Interface:** 在唯一 `DesktopCreativeManagementCatalog` union 中加入 `works`，沿用 `open-creative-management` intent；Project 模板通过 `ProjectCatalogRoot` 的最小 callback 返回既有 `open-agent-entry`，不新增 channel、handler 或版本字段。
- **Extension:** 后续真实作品 publication catalog 可以替换 Works 页的空 projection，但必须由独立 OpenSpec 定义 owner 和读取端口；本变更不预留 registry、provider 或 fallback。
- **Testing:** Host codec/service 证明 Works catalog 走 canonical Scene 且已移除的 Templates catalog 被拒绝；Renderer 证明五个稳定入口、Project 模板内容以及 Development/Release 实验可见性。

## Decisions

### 1. Works is a Host-owned singleton management scene; Templates is not

`DesktopCreativeManagementCatalog` 增加 `works`。producer 是 Renderer 的 `open-creative-management` intent，consumer 是 `DesktopShellService` 的既有 `createTransitionedScene`，最终 Main Surface 仍是精确 `creative-management` ref。内置 Project 模板没有独立 identity、管理操作或生命周期，因此不保留 `templates` catalog、Scene、导航入口或私有页面 owner。

### 2. Works does not invent publication facts

当前仓库没有跨 Project 的作品 publication identity、状态或 catalog port。Works 页显示本地化空状态，明确只有在作品完成并进入未来正式目录后才显示。它不得读取当前打开的 Workbench View、复制 Project 列表、扫描 Workspace、回退到 Asset Center 或把 transient presentation 当作 durable 作品。

### 3. Project quick starts reuse existing product copy without prompt injection

Project catalog 展示开始创作已有的 storyboard 与 video plan 标题和说明。卡片操作只通过 canonical Scene transition 返回“开始创作”；本变更不把模板文案写入 composer、创建 Project、创建 Conversation 或触发 Agent turn，因此不改变 Agent/Prompt/Skill 行为。Character kit 不属于 Project owner，在 Character 创建流程具备真实入口前不展示。

### 4. Navigation labels are canonical and ungrouped

稳定入口依次为：开始创作、项目、作品、资产库、扩展。只有 Development 的角色与世界位于“实验”分组。英文对应 `Projects / Works / Asset Library / Extensions`。

### 5. Works and Project templates share the centered management frame, not Extension card styling

Works 与 Project catalog 的外层宽度、水平居中和顶部留白遵循同一管理页布局基准，但 Project 模板不复用 Extensions 的能力卡片样式。两个 Project 模板使用紧凑、受控宽度的视觉卡片，并位于 Project 记录之后的明确“从模板创建”分区。Works 使用与其他领域目录一致的 Hero 标题和说明，以及独立“我的作品”内容分区；空状态在该分区上部呈现，不使用横向大框、假卡片、搜索、操作按钮或模式切换。

作品 Hero 当前没有新增、导入或开始创作操作。作品只能在未来 publication owner 和 canonical producer 确立后进入目录；本次只调整可丢弃 presentation，不借布局优化扩展业务语义。

作品 Hero 插图使用与项目、角色、世界管理一致的 420×152 bounded visual field、倾斜主卡片、右下叠层、虚线连接、54px 图标块、accent-aware surface 和窄屏隐藏规则。Desktop 只保留作品特有的文件、集合与打开结果图标；该统一属于 presentation，不建立跨领域状态或业务组件。

Works 与 Project catalog 当前都只有一种 canonical presentation，因此不显示模式切换器，也不增加列表管理。只有未来出现两种真实、用户可选择的领域模式时，切换控件才复用 Extensions 的顶部居中 segmented-tab 模式。列表视图仍需出现大量记录、状态列或批量管理等真实消费者后由独立变更引入；Project 模板不为假设规模增加列表视图或 masonry。

## User-data impact

无。新增 Scene 是可丢弃 presentation；切换页面不修改 Project、Workspace、Conversation、Asset 或未来作品记录。

## Replaced path

替换缺少 Works/Templates 的四项稳定入口和 `All projects / Asset Center` 字段。没有保留旧标签 alias、旧 catalog 或 Renderer 私有导航成功路径。
