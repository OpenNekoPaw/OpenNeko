## Context

Desktop 目前有三种不同所有权的配置：

1. Desktop 用户级应用偏好，例如主题、语言和启动行为；
2. Agent 用户/工作区配置，由 `neko-agent` 通过 `~/.neko/config.toml` 与工作区 `.neko/config.toml` 管理；
3. 项目事实与窗口/工作台状态，由项目领域和 Desktop Shell state 管理。

现有设置按钮直接发送 `openUserConfigFile`，只覆盖第二类配置，并让 Home 在没有 Agent view grant 时无法进入设置。Renderer 已有系统主题和 i18n adapter，Host 已有原子 JSON repository、AppHost、preload 与 sender-bound IPC 模式。本次应沿这些既有边界补齐设置能力，而不是在 renderer 建立文件访问或复制 Agent 配置实现。

组件复用审计结论：设置页复用 `@neko/ui` 的图标、按钮、Tooltip 和表单交互语义，继续消费 shared/Desktop theme token；设置页是新的应用级信息架构，不复用 Canvas、Agent 或 Assets 的领域 Root，也不建立第二套 design system。

增量复用审计结论：设置页的分类信息架构仍由 Desktop Settings surface 拥有，但应用侧栏 frame、品牌头、导航项、宽度调整 binding、搜索输入、页面标题 typography 和主内容 surface 必须复用 Home 与项目工作区的 Desktop Shell primitives。共享 primitive 留在 Desktop renderer 组合边界，因为它依赖应用品牌和 workbench sidebar contract，不提升到无业务 `@neko/ui`；pointer resize 机制继续复用 `@neko/ui` 的 `useResizable` 与 `ResizeHandle`，不复制拖拽算法。

## Goals / Non-Goals

**Goals:**

- 提供 Home 与项目工作区都能打开的独立 Desktop 设置页面，并能返回打开前的应用表面。
- 建立版本化、可校验、原子持久化的 Desktop 用户偏好 authority。
- 首批真实支持主题、语言、启动目标和资源浏览默认视图。
- 让设置更新即时投影到当前窗口，并让共享用户设置能同步到同一应用实例的其他窗口。
- 保持 Desktop、Agent 与项目配置的唯一事实来源，提供统一入口但不混写。
- 对非法 schema/value、陈旧 revision 与写入失败保持 fail-visible。

**Non-Goals:**

- 把 Agent provider/model/MCP/credential schema 复制到 Desktop 设置文件。
- 把项目级画布、Cut、Entity 或媒体库事实迁移到用户级设置。
- 创建任意主题编辑器、下载主题或 VS Code 设置兼容层。
- 在本次变更中重新设计 package-owned Agent/Canvas/Cut/Preview/Assets Root。

## Decisions

### 1. Desktop 设置使用独立 Host-owned repository

新增 `DesktopApplicationSettingsRepository`，存储在 Electron `userData/state/desktop-application-settings.v1.json`。文件只包含 Desktop 用户偏好与 storage revision，采用与 Shell state 相同的临时文件加原子 rename 写入。

首批偏好为：

- `theme`: `system | light | dark`
- `locale`: `system | en | zh-cn`
- `startupTarget`: `home | restore`
- `resourceBrowserView`: `list | grid`

选择独立 repository 而不是扩展 Shell state，是因为 Shell state 是窗口/项目事实且生命周期不同；选择 JSON 而不是 `config.toml`，是为了避免侵入 Agent authority 并保持 Electron Host 可校验的版本化 DTO。

### 2. Settings service 是 repository 与运行时副作用的唯一编排者

`DesktopApplicationSettingsService` 串行化读取和 optimistic update，校验 expected revision，提交后向订阅者广播完整 projection。Main composition 订阅 projection：

- 更新 Electron `nativeTheme.themeSource` 和窗口背景；
- Shell 只在 claim/restore Window 时读取 `startupTarget`；
- renderer 通过 bridge 接收 projection，并更新 shared theme 与 i18n adapter；
- Assets Root 只接收 `resourceBrowserView` 作为无项目显示状态时的默认值，项目内用户显式选择仍由 Assets Root 的 display state 拥有。

不使用 renderer localStorage，因为它会绕过 Host authority、多窗口同步和 schema diagnostic。

### 3. Settings bridge 使用显式 request/revision contract

新增独立 settings L0 contract 与 IPC channels：

- `settings.get`
- `settings.update`
- `settings.event`
- `settings.openAgentAdvanced`

所有请求携带 contract version 和 request id；更新携带 expected revision 和完整 preferences。AppHost 先验证 sender 对应已注册 Window，再调用 service。Preload 解析 request/response/event 并维护投影 cursor；陈旧或错序事件触发明确错误，不回退到本地默认值。

### 4. Agent 配置只作为独立 owner 的高级入口

设置页的 Agent 分类说明 provider、model、MCP 和 credential 由 Agent 管理。“打开高级 Agent 配置”调用 Host action 打开 Agent canonical user config；该 action 不读写 Desktop 设置 repository。凭据仍只经过 Agent credential runtime/HostSecretPort，不进入设置 projection、renderer 或日志。

### 5. 设置页是应用级表面，不是工作区 tab

Renderer 使用显式 `workspace | settings` 应用表面状态。设置页替换主应用内容，带返回按钮、分类导航和搜索，不创建全局工作区 tab，也不要求活动项目或 Agent connection。打开设置时记录来源表面；返回后继续显示原有 Home section 或项目工作区。

### 6. 主题和语言只有一条运行时投影路径

现有 `applyResolvedDesktopTheme()` 继续是 token 投影唯一入口。新的 theme controller 根据偏好解析：

- `system`：监听 `prefers-color-scheme`
- `light/dark`：使用显式值，系统变化不改变结果

i18n 继续使用 shared webview adapter 的 `setLocale()`，`system` 通过 navigator locale 解析。设置提交成功后才更新 UI，写入失败不得显示为已保存。

### 7. 设置页复用 Desktop Shell 的应用级视觉骨架

Home、项目工作区和设置页使用同一个应用侧栏 frame、品牌头和导航按钮组件。Home 与设置页通过共享 frame 注入同一个 primary-sidebar resize binding；项目工作区把同一 binding 交给 `ControlledWorkbenchShell`，三条路径最终都更新同一 `workbench.primarySidebar.width`。设置页主内容复用 Home 的 main surface、内容宽度和 `home-launchpad-heading` 字体层级；设置领域只拥有分类、设置行与 authority 说明。不得为设置页保留独立侧栏宽度、独立标题字体、独立背景层级或一套平行的导航视觉规则。

设置页在侧栏宽度变化时，品牌、返回、搜索和分类导航应组成同宽、水平居中的响应式控件列。控件列宽度必须根据当前可用侧栏宽度连续变化，并通过动态安全边距保持合理密度；不得固定为单一像素宽度。控件内部图标和文字继续左对齐。该约束属于设置页信息密度适配，不改变共享侧栏 frame、宽度持久化或 Home/项目业务导航的布局。

## Risks / Trade-offs

- [设置更新同时影响 main 与 renderer，短暂不同步] → service 先原子提交，再广播完整 projection；renderer 只接受连续 revision，Main 同步设置 Electron theme source。
- [启动行为修改污染已有窗口状态] → `startupTarget=home` 只改变下一次 Window claim 的 active target，不删除 tabs、项目或 workbench state。
- [资源默认视图覆盖项目内选择] → 默认值只用于 Assets Root 没有已保存 display state 的情况。
- [直接打开 Agent 配置看似属于 Desktop] → UI 和 contract 明确标识为 Agent-owned advanced action，并用测试断言 Desktop repository 永不出现 Agent 字段。
- [未来设置项不断扩张] → contract 只加入具有明确 owner 和已接入消费者的字段；未知字段/version fail-visible，新增字段通过版本迁移完成。

## Migration Plan

1. 新 repository 在文件不存在时返回 version 1 默认值，不读取或迁移 `config.toml`。
2. 接入 Host service/bridge 并让 renderer bootstrap 获取 projection。
3. 将旧设置按钮替换为设置表面导航；保留 Agent advanced config 为设置页内的显式 action。
4. 将主题、语言、启动目标和资源默认视图消费者切换到 canonical projection。
5. 验证旧 `onOpenSettings -> openUserConfigFile` 路径不再存在。

回滚时可以删除 Desktop settings 文件并恢复系统默认偏好；Agent 配置和项目数据不受影响。

## Open Questions

- 无。本次只实现已存在明确消费者的四项 Desktop 偏好；媒体缓存、导出、自动保存和设备配置等后续在对应领域 contract 就绪后再加入。
