## Context

扩展场景组合 Agent Skill、Agent MCP 与专业应用三个 package-owned presentation。模式切换是 Desktop scene composition concern；条目语义和操作仍分别由 Agent/Professional Applications Webview 拥有。

五层分析：

- 职责：Desktop Renderer 决定当前 mounted 模式；Agent Webview 决定 Skill/MCP 条目；Professional Applications Webview 决定应用表单与操作。
- 依赖：只使用既有 contracts、React DOM 和 `@neko/ui` 图标，不接触 Electron、Node 或持久化。
- 接口：Roots 增加最小 `compactHeading` presentation prop；runtime public ports 不变。
- 扩展：三模式是显式 union，不增加 registry、分类 authority 或持久 layout。
- 测试：组件覆盖唯一 selector、mounted Root 与 reduced metadata；样式覆盖选中/焦点、轨道和响应式；真实 Electron 验收三个模式。

## Goals / Non-Goals

**Goals:**

- 让 Skill / MCP / 专业应用模式一眼可见且选中明确。
- 删除页面与条目中不帮助当前决策的重复信息。
- 让目录卡片只承担浏览与选择，把完整 metadata、配置和操作放入当前详情 Overlay。
- 保留异常诊断与专业应用操作所需状态。
- 保持搜索与 runtime 自动加载路径不变；目录固定为卡片模式。

**Non-Goals:**

- 不新增市场、安装、分类、收藏、排序、详情持久化或 Desktop Scene，也不在缺少候选集与安装 authority 时投影安装状态。
- 不在缺少 installed-library authority 时新增上传、删除、停用或商店查找按钮。
- 不删除 authoritative provider、invocation 或 readiness facts；只停止在目录重复展示。
- 不改变项目、角色、世界或其他管理场景。

## Decisions

### 1. 模式选择器独立于搜索工具栏

Desktop composition 在目录顶部渲染唯一 Skill / MCP / 专业应用选择器，使用图标、文字、清晰选中面与 focus ring。切换时只 mounted 当前 Professional Root 或同一 Agent Root 的精确 tab，不保留隐藏 Root。

### 2. package Root 支持 compact heading

Agent 与 Professional Roots 接收 `compactHeading`。Desktop 模式下不渲染重复 eyebrow/title/description；Standalone consumer 保留完整 heading。两个 Root 都在 mount 时自动读取 snapshot，不保留额外手动刷新入口。

### 3. 卡片只展示决策所需信息

Skill 和 ready MCP 卡片只显示名称、用途摘要和类型图标。provider、调用权限、canonical invocation 与 ready 文本仍存在于 projection/runtime，但不在目录重复。unsupported/error MCP 显示 status + diagnostic code。

卡片使用固定上限而不是可无限拉伸的 `1fr` 列。圆形类型图标、名称、摘要和轻量详情箭头组成一个紧凑信息块；摘要与名称左缘对齐并限制为两行，避免图标下方形成无意义空洞。边框、阴影和 hover 只用于区分卡片层级。详情 Overlay 关闭前，背景卡片通过 `aria-pressed` 与高对比边界保持明确选中态。

### 4. 详情使用 package-owned Overlay，而不是 Workbench 分栏

详情是当前目录条目的短时检查或配置操作，不形成独立业务记录、编辑器或后台 runtime，因此由对应 Webview Root 保存 disposable selection 并使用共享 `@neko/ui` Dialog。关闭详情即释放选择；目录 Root 保持 mounted。Skill/MCP Overlay 以能力说明为主，并把完整只读 metadata 收敛成低权重行式信息；不得把 identity、source、provider 与 invocation 各自放大成主内容卡片。专业应用 Overlay 独占配置字段、readiness、保存、应用选择、下载和启动操作。目录卡片不得保留第二套可编辑配置。

不使用 Workbench 分栏：分栏适用于需要长期并排比较或持续编辑的领域 Surface，而扩展详情没有独立 Scene identity，也不应修改 Host Scene contract。

### 5. bounded responsive layout 保持

沿用 1240px 页面 track，搜索、标题与扩展卡片网格共享由五个 214px 卡片列和四个 12px 间距组成的 1118px 目录内容 track；宽视口不再让工具栏单独延伸到卡片网格之外。搜索框占满该目录内容 track，使其左右边界与卡片网格一致，并随容器宽度一起收缩；不再使用独立固定上限造成搜索框与显示区域脱节。扩展卡片使用 214px 固定列并按内容决定高度；宽视口只增加卡片数量，不把少量卡片拉伸成大面板。卡片 hover 只改变边框、阴影和详情箭头，不做会被滚动容器裁切的纵向位移。标题行包含图标、名称与详情箭头，摘要在下一行使用完整卡片内容宽度。项目目录保持独立 1020px 规则。目录固定为卡片模式，不再保留 grid/list presentation state 或手动刷新控件。模式选择器在窄容器中保持三项可达，不与搜索栏争抢宽度。

### 6. 已加载目录不投影安装状态

当前 DSH snapshot 只返回当前已加载 Skill，并没有商店候选或独立 installed flag。`bundled`、`user-dsh` 与 `project-agents` 是来源事实，不等价于安装状态；Skill Root 因此展示完整已加载目录，不提供“全部 / 已添加”筛选。

当前 MCP projection 没有配置条目生产者时，Root 展示“尚未配置 MCP”的明确空状态，不把空目录解释为“已添加 0”。专业应用已有 `unconfigured`、`not-installed`、`ready` 等 package-owned readiness，目录继续直接展示这些状态，不增加含义重复且不准确的“已添加”筛选。

能力管理仍通过详情查看权威信息。删除、停用或更新会改变用户数据或运行时目录，必须由未来 installed-library owner 定义 identity、来源、可变性和 fail-local diagnostic 后再开放。

### 7. 创建与上传不使用假入口

现有 Agent `CreateSkill` Tool 是唯一 canonical 创建路径，并绑定 Assistant 或精确 Workspace Conversation authority。扩展页若增加“创建能力”，应通过显式 Agent handoff 打开该路径，不能在 Renderer 直接写 Skill 文件。

“上传能力”需要独立的原生文件/目录选择、Host 授权、DSH 隔离校验、no-replace 发布和 catalog observation contract。当前 Extension Management runtime 只有只读 snapshot，因此本变更不渲染不可执行的上传菜单；后续应由独立 OpenSpec 原子增加 import contract、UI 和验证。

## Risks / Trade-offs

- [隐藏 invocation 降低高级用户可见性] → canonical 名仍参与搜索；未来若有真实需求可在详情/tooltip 展示，不回到所有卡片常驻 metadata。
- [compact heading 影响 standalone] → prop 默认 false，只有 Desktop composition 显式启用。
- [专业应用信息仍较多] → 其 readiness 与配置直接决定操作，不按 Skill 卡片强行删减。
- [Overlay 隐藏目录上下文] → 使用 bounded modal 与 backdrop，背景目录保持 mounted 且选中卡片可见；关闭返回同一查询和模式状态。

## Migration Plan

1. 提升唯一 Desktop mode selector 并接入图标/选中状态。
2. 为两个 package Root 增加 compact heading，移除 Agent card 冗余 metadata。
3. 将详情 selection 保持在各 package Root，并把专业应用配置原子迁移到 Overlay。
4. 更新 focused tests、typecheck、OpenSpec 和 diff 检查。
5. 在真实 Electron 验证三模式切换、详情选择/关闭、配置与视觉层级。

回滚仅恢复 presentation；没有 contract 或用户数据迁移。

## Open Questions

无。
