## Why

项目管理、资源中心、角色管理和世界管理已经使用相似的标题、工具栏和卡片目录，但各自仍采用不同的内容宽度、搜索框尺寸、卡片圆角与自适应列规则。宽屏下稀疏卡片会被 `1fr` 拉伸，页面左右边界也不一致，使同一层级的管理场景看起来像四套独立产品。

## What Changes

- 将项目、作品、资产、角色和世界管理目录统一到同一 bounded content track、标题层级、工具栏间距和响应式内边距。
- 统一目录卡片的边界、圆角、背景、hover、focus 与 selected 状态语言。
- 按内容场景保留不同卡片密度：项目与世界使用宽卡、角色使用中型身份卡、资源使用紧凑缩略图卡。
- 宽屏下使用 bounded card tracks，最后一行左对齐，不把少量卡片拉伸成大面板。
- 搜索框按页面密度使用剩余或紧凑宽度，并在窄容器下独占一行；既有导入、排序、视图和创建行为保持不变，普通手动刷新入口由页面进入时的 canonical load 取代。
- 修正 Asset Center 进入 Preview 分栏后被 Desktop 固定 `compact` 标记覆盖的问题：媒体库继续按实际容器宽度决定标题、搜索和控制组是否换行，列表条目保持紧凑卡片边界而不横向拉成文件管理器条带。
- Asset Center 有 Preview 时默认让管理目录占主要宽度；Preview 内部错误仍 fail-visible，但使用有边界的文档错误状态而不是孤立的小字。
- 根据真实页面反馈提高 Desktop 浅色主题的正文、次级文字与图标对比度，并让项目“打开已有项目”和资产“导入资产”使用清晰的 canonical 主按钮色；禁用态仍保持可辨识的降权语义。
- 将 Asset Center 的真实“媒体库 / 资产库”catalog 选择提升为顶部居中的模式切换；fresh Asset Center Session 默认进入媒体库，不再重复模式标题或说明，当前模式主操作与排序、视图控件合并为一行并移除手动刷新按钮；搜索按工具栏剩余宽度自适应，空状态按当前模式和查询状态提供准确文案与既有操作入口。
- 将作品页补齐为同层级管理目录：移除额外 eyebrow，统一 Hero 高度、标题、说明、内容宽度和 collection 工具栏，并提供紧凑搜索框与准确的查询空状态。
- 移除角色与世界管理目录剩余的普通刷新按钮；项目、作品、资产、扩展、角色和世界都由进入当前页面时的既有 mount/attach/scene projection 路径读取最新状态，失败状态仍保留显式重试。
- 统一相邻管理分组的纵向节奏：有内容的角色、世界和项目目录按实际卡片高度结束，模板分组通过固定 section gap 排列；只有空状态继续保留承载诊断和操作所需的最小高度。
- 将扩展管理页从外宽内窄的偏移布局收敛到资产库相同的 1118px 居中内容轨道，并让两页搜索框按工具栏剩余空间自适应；窄容器下仍独占整行。

## Capabilities

### New Capabilities

- `management-catalog-presentation`: 定义管理目录的统一页面骨架、场景化卡片尺寸、状态反馈和响应式行为。

### Modified Capabilities

无。

## Impact

- `apps/neko-desktop/src/renderer`：作为 Desktop scene composition presentation owner，调整 Project/Works catalog 的页面与卡片样式，并验证 package-owned Roots 的共同视觉契约；不新增业务规则。
- `@neko/assets-webview`：继续拥有 Asset Management Root，只调整资源目录布局、响应式工具栏、列表/缩略图卡片密度。
- `@neko/preview-webview`：继续拥有文档 Viewer，只调整 EPUB 错误状态的 presentation，不改变错误产生、资源授权或加载路径。
- `@neko/chara-webview`：继续拥有 Character Management Root，只调整角色目录布局和身份卡片密度。
- `@neko/world-webview`：继续拥有 World Management Root，只调整世界目录布局和世界卡片密度。
- canonical contracts、producer、IPC、持久化、导航、导入、创建和 runtime 路径不变。被替代路径仅是不一致的 presentation CSS 与普通状态下冗余的刷新按钮。
- 用户数据无迁移、覆盖或删除；搜索、排序与视图状态仍是可丢弃 Renderer presentation state。
