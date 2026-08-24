## Context

Project/Works Desktop composition、Assets Webview、Character Webview 和 World Webview 分别拥有对应目录。它们的领域内容不同，但都是 Window 中当前单例管理 scene 的 package-owned presentation。统一视觉不需要把 Root、状态或领域卡片抽到一个跨领域 React owner。

五层分析：

- 职责：各 owning package 保留条目内容、选择和操作；Desktop 只保留 Project composition 与跨场景验收。
- 依赖：改动只依赖现有 theme tokens、CSS container/media query 和既有 DOM class，不接触 Electron、Node 或领域 ports。
- 接口：React props、contracts、IPC 与 package public entries 不变；共同契约通过一致的 CSS token 语义和 focused style tests 表达。
- 扩展：新增管理场景可选择内容密度，而不需要加入跨领域 registry、全局 store 或共享 retained Root。
- 测试：分别覆盖内容轨道、bounded grid、卡片状态和窄宽布局，并在真实 Electron 中检查五个页面。

## Goals / Non-Goals

**Goals:**

- 让五个管理场景共享清楚、稳定的页面骨架。
- 让卡片拥有一致的视觉语言，同时根据内容类型选择合适尺寸。
- 避免宽屏卡片拉伸、末行错位、搜索框固定宽度和首行边框裁切。
- 保持空状态、列表模式和紧凑 Workbench 嵌入可用。
- 让 Asset Center 分栏中的媒体目录按实际内容宽度响应，并把目录保持为主要工作区。

**Non-Goals:**

- 不合并 Project、Asset、Character 或 World 的 React Root、数据 owner 或生命周期。
- 不新增或删除导入、创建、上传、列表/网格、详情或管理行为；只移除普通状态下冗余的手动刷新入口，错误恢复的“重试”继续保留。
- 不改详情/Preview 的内容语义、authoring、runtime、导航或持久化模型；只调整 Asset Center 分栏比例与既有错误状态的视觉边界。
- 不引入跨领域页面 registry、通用 catalog state 或新的共享组件层。

## Decisions

### 1. 页面骨架统一，领域 Root 继续独立

五个 full-scene catalog 使用 1118px bounded content track、`calc(100% - 72px)` 的宽屏边距和 `clamp(48px, 7vh, 76px)` 的顶部节奏。Hero 标题使用 24px，说明保持紧凑层级，工具栏控件统一为 36px；标题、工具栏和目录共享左右边界。窄视口改为 16px 左右边距与更紧凑顶部留白。

不抽取共享 React Root：五个目录的 producer、selection 和操作完全不同，强制复用会把展示一致性扩大成跨领域 ownership。各包以同一视觉参数实现，并由 Desktop focused style test 对账。

### 2. 卡片语言统一，尺寸按场景选择

所有卡片使用 13px 圆角、低对比边框、raised surface 和不改变几何位置的 hover。可打开的 identity 卡使用与 Extension 一致的 32px 圆形图标；选中态使用 accent border、轻量 accent surface 和外侧 ring；focus 保持可见且不依赖颜色单一表达。

场景尺寸固定为：

- Project：280px 宽、约 100px 高，适合项目名称、更新时间和局部管理动作。
- World：280px 宽、约 112px 高，适合名称、两行摘要和精简 metadata。
- Character：214px 宽、约 96px 高，接近 Extension identity 卡密度，适合头像、名称、摘要和版本数量。
- Asset：176px 宽、约 132px 高，保留缩略图所需的纵向空间。

Grid 仅在容器不足一个卡片宽度时收缩到 100%；宽屏通过增加列数提升密度，最后一行保持 start alignment。List mode 继续占满内容轨道。

### 3. 工具栏弹性与响应式

普通管理目录搜索框使用 `flex: 1 1 320px` 和 `min-width: 0`。Extension 与 Asset Center 在宽屏占用工具栏其余控件之外的剩余空间；Works 因尚未连接 durable catalog，继续使用紧凑宽度。窄容器下搜索仍先占满整行。工具栏控件统一为 36px。打开已有项目、导入资产等当前页面的主要 mutation 使用 canonical 深色主按钮；排序和视图继续使用安静的次级控件。普通手动刷新入口不再展示，容器不足时其余控件换行且仍可达。此规则只改变布局和视觉层级，不改变查询、排序或 mutation 语义。

### 3.1 Asset Center 的 catalog 是模式，不是筛选条件

`media-library` 与 `global-asset-library` 是现有 controller filter 中两个真实、互斥的 catalog，分别拥有连接目录和导入资产操作。它们使用 Extension 管理页同类的顶部居中 segmented control，位于 Hero 之前；不再混入搜索、排序和视图工具栏末端。切换仍调用既有 `updateFilter`，清空 query 与 directory，不增加第二个模式 owner。

顶部模式切换承担唯一可见身份，因此不再重复显示 eyebrow、模式标题或模式说明；同名 `h1` 仅作为辅助技术可读的页面结构保留。fresh Asset Center Session 的 canonical filter 由 Assets Domain 初始化为 `media-library`；用户在当前 Session 中显式选择资产库后仍保留该选择，不在 Renderer 制造第二套重置逻辑。当前模式的主操作与排序、列表/网格控件进入同一 toolbar 行，手动刷新按钮移除；mutation 和既有自动读取仍使用同一 `runtime.refresh()` 路径。空 catalog 与查询无结果必须分开：无查询且无记录时显示当前模式说明和既有“连接目录 / 导入资产”操作；存在 query 时仅显示没有匹配结果，不把搜索失败伪装成需要导入或连接。列表/网格切换继续保留，因为资产文件 metadata 与批量管理具有真实列表消费者。

### 3.2 作品加入统一骨架，普通刷新入口由页面进入替代

Works 是 Desktop composition 拥有的独立管理 scene，不再使用额外 eyebrow 或更短的顶部内边距。它采用与 Project、Character 和 World 相同的 1118px track、Hero 高度、24px 标题、说明文本和 collection header，并提供同尺寸搜索输入。当前 Works catalog 尚未接入 durable records，因此搜索只区分 canonical 空目录与查询无结果，不伪造作品、排序或刷新行为。

Project、Works、Assets、Extensions、Character 和 World 的正常管理状态不显示手动刷新按钮。用户进入这些单例 scene 时，当前 owner 继续通过既有 scene projection、Root mount、Session attach 或 active-effect 路径读取当前状态；切换离开会卸载当前 Root，重新进入会再次触发该唯一读取路径。Character 和 World 删除的只是 `runtime.reload()` 的普通按钮调用，mount/active reload、搜索/排序查询和 mutation 后刷新保持不变。读取失败时保留明确 diagnostic 与“重试”，避免把暂时失败伪装成空成功。

### 3.3 分组间距由 section gap 决定，不由卡片高度补空白

Hero、当前目录和模板入口是管理页的相邻一级分组，统一使用 36px section gap；分组内部标题到内容使用 14px gap。有记录时，目录 grid 必须按真实卡片高度结束，不得通过统一 `min-height` 在较矮卡片下方制造不同大小的空白。空目录仍可以拥有 220px 的局部最小高度，用于稳定 Empty State、诊断和恢复操作，但该规则只能由明确的 empty state selector 激活。

Project 模板入口的标题字号和内部 gap 与 Character、World 对齐；卡片自身仍保留领域需要的不同高度。这样统一的是分组边界，不是卡片内容密度，也不引入跨领域布局组件或状态 owner。

### 3.4 扩展与资产目录共享同一宽屏轨道和自适应搜索

Extension composition 的模式切换继续由 Desktop 拥有，Skill、MCP 和专业应用目录继续由各 package Root 拥有；只统一可见尺寸。扩展 Root 与资产 Root 在 full-scene 下都使用 `min(1118px, calc(100% - 72px))` 的居中内容轨道，工具栏、搜索和卡片目录共享同一左右边界。扩展不再使用 1240px 外层包裹 1118px 靠左内容的两层宽度规则，避免与资产库切换时产生水平跳动。

扩展与资产的宽屏搜索框都使用 `width: auto`、`flex: 1 1 320px` 和 36px 控件高度，在同一工具栏内占用模式操作、筛选、排序和视图控件之外的剩余空间。其余控件保持各自 owner 的现有语义和 intrinsic width，不用固定搜索宽度制造无意义留白。容器不超过现有 package 阈值时，搜索切换为 100% 宽度并独占一行；这只是 presentation 规则，不新增共享 React 组件或跨领域状态。

### 6. 浅色主题文字满足小字号清晰度

Desktop theme projection 是 Shell、package-owned Webview 和 Canvas 共同消费的唯一主题入口。浅色主题的正文、secondary、muted、placeholder 和 icon token 使用不透明的中深灰层级，最浅的常规小字号文字仍保持至少 4.5:1 的白底对比度；disabled 控件继续由 owning component 显式降低 opacity，不把禁用语义混入常规文字 token。各页面不得复制局部深色值来形成第二套主题。

### 4. 视觉状态不改变领域状态

hover、focus 与 `aria-pressed`/`data-selected` 只投影现有交互状态。卡片不使用 translate，避免滚动容器裁掉首行边框。非法或不可用记录继续保留 owner-defined diagnostic，不用统一样式掩盖错误。

### 5. Asset Center 分栏由实际容器宽度驱动

Asset Management Root 即使位于带 Preview 的 Main 分栏，也继续使用 package-owned bounded track 与 container query。Desktop 的 `data-panel-size="compact"` 只表达当前 composition，不再替 Assets 决定标题、工具栏、搜索框或列表列宽；实际内容宽度低于 package 阈值时，搜索才独占一行，操作控件保持为相邻的一组。

Asset Center 首次打开 Preview 时默认采用 60/40 的 management/preview 比例，用户仍可通过现有 resize binding 调整，且 management 下限仍为 50%。这让目录保持主要任务面，同时给文档和媒体 Preview 留出可用宽度。EPUB 加载错误继续在 Preview owner 内 fail-visible，但投影为有边界、有换行能力的错误状态，不改变 diagnostic 文本或资源路径。

## Risks / Trade-offs

- 固定卡片宽度会在某些视口留下少量右侧空白，但比拉伸稀疏条目更利于扫描，并保持跨场景稳定密度。
- 相同参数在多个 package CSS 中出现；这是刻意保留 package ownership 的小规模视觉重复，focused style test 防止漂移。
- 真实内容长度可能超过设计密度；现有 ellipsis/two-line clamp 保留，完整事实继续由详情或 owner-defined操作提供。

## Migration Plan

1. 更新 focused style contracts，先固定统一轨道与四种场景尺寸及 Works 页面层级。
2. 原子调整 Project、Asset、Character 和 World package-owned CSS。
3. 运行各 package tests/typechecks、Desktop style tests 与 OpenSpec checks。
4. 在真实 Electron 中检查项目、作品、资产、角色和世界目录的宽屏、空/稀疏/多卡和交互状态。

回滚仅恢复 presentation CSS，不涉及数据迁移或替代运行路径。

## Open Questions

无。
