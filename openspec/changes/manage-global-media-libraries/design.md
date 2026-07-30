## Context

Desktop 资产中心目前通过 `DesktopHomeManagement` contract 查询 `~/.neko/assets`：根目录的直接子目录被视为全局媒体库，目录中的媒体文件被聚合为全局资产。该路径只有读能力；项目内 `WorkspaceLinkedMediaLibraryService`、`MediaLibraryCopyService` 和 `MediaLibraryDeleteService` 分别拥有工作区链接与单文件操作语义，不适合复用来维护用户级物理目录。

此变更跨越 Renderer、preload、IPC、AppHost、Resource Browser runtime 和 Electron 组合根。Webview 沙箱不能获得任意绝对路径或直接访问文件系统；目录选择、复制和废纸篓必须停留在主进程。

五层分析：

- 职责：Renderer 负责意图、确认与反馈；共享契约负责验证；AppHost 负责 sender/endpoint 身份；Resource Browser runtime 负责全局库领域规则；Electron 组合根负责原生对话框、递归复制和废纸篓。
- 依赖：Renderer 仅依赖 typed bridge；preload/IPC 依赖共享 contract；runtime 依赖注入的本地副作用，不反向依赖 React 或 Electron。
- 接口：修改操作使用 `add`、`remove`、`reveal` 三个显式命令；库标识使用目录名，不传绝对路径。
- 扩展：未来可在同一 management port 增加重命名或库内导入，不需要修改查询模型；本次不引入通用 registry/factory。
- 测试：contract exact-shape/version、主进程路径与副作用、IPC/bridge、Renderer 操作状态以及真实 Electron Webview 路径分别验证。

## Goals / Non-Goals

**Goals:**

- 从原生目录选择器导入完整目录到用户级全局媒体根目录。
- 确认后把全局媒体库移入系统废纸篓，并支持在系统文件管理器定位。
- 所有修改完成后刷新当前目录，明确呈现取消、冲突与失败。
- 保证用户输入不能越过全局媒体根目录，也不能覆盖既有库或跟随符号链接执行管理操作。
- 保持单一 canonical path，不保留 v3 mutation fallback。

**Non-Goals:**

- 不把外部目录链接为全局库；添加采用复制语义。
- 不改变项目内 workspace-linked media library。
- 不在本次实现库重命名、库内单文件上传、跨设备同步或后台拷贝任务系统。
- 不永久删除库，也不提供应用内废纸篓恢复 UI。

## Decisions

### 1. 全局媒体库管理由 Desktop Resource Browser runtime 拥有

`DesktopResourceBrowserRuntime` 已拥有全局资产根目录和读取目录的 canonical path，因此新增全局库管理方法，并通过 AppHost 暴露 Home Management 命令。Renderer 不调用项目媒体库控制器。

替代方案是把操作放入项目内 `neko-assets` 服务，但该服务的授权、locator 和生命周期都以 workspace 为中心，会混淆用户级与项目级事实。

### 2. 原生副作用由 Electron 组合根注入

runtime 接收三个窄能力：选择导入目录、递归复制目录、移入系统废纸篓。Electron 组合根分别使用 `dialog.showOpenDialog`、Node 文件系统复制和 `shell.trashItem` 实现。定位继续复用 `HostExternalPort.revealPath`。

这样 Electron API 不进入 domain/runtime 测试，也无需为单一 Desktop 用例扩大共享 `HostFileSystemPort`。若未来第二个宿主需要相同操作，再评估提取共享 host port。

### 3. 导入采用原子目标占用与不覆盖语义

目标名称取所选目录 basename，并要求 NFC、非空、非 `.`/`..`、不含路径分隔符。目标必须是全局根目录的直接子项。若名称已存在，操作显式失败，不覆盖或合并。

复制先写入同一根目录内的唯一 staging 目录，完成后 rename 到目标目录；失败时清理 staging。这样查询路径不会把半成品目录呈现为可用媒体库。staging 名使用保留前缀，并从目录查询中排除。

直接递归复制到最终目录更简单，但中途失败会暴露部分库；静默自动改名又会掩盖用户意图，因此不采用。

### 4. 删除只接受目录查询投影产生的稳定库标识

命令携带 `libraryId`，格式必须为 `library:<name>`。runtime 重新解析、验证并 `stat` 目标，要求目标是全局根目录的直接普通目录，且不是符号链接。Renderer 的确认只改善 UX；主进程验证才是安全边界。

删除调用系统废纸篓，因此可由用户在操作系统恢复。找不到目标、非法标识或越界路径都 fail-visible，不做幂等成功。

### 5. Home Management contract 升级为 v4

新增 `assetsAddLibrary`、`assetsRemoveLibrary`、`assetsRevealLibrary` channels 及 exact-shape request/result parser。结果显式区分 `added`、`removed`、`revealed` 和 `cancelled`。添加取消是正常结果；其他异常抛出并由 UI 展示。

旧 v3 payload 必须被拒绝，避免新旧语义并行。

### 6. Renderer 使用单操作状态与重新查询刷新

媒体库页同一时间只允许一个 mutation。添加、删除、定位操作期间禁用冲突按钮；成功添加/删除后提升本地 revision 重新执行搜索。刷新按钮只提升 revision，不新增 IPC。

删除先使用可访问的确认对话框；取消不发出 mutation。Assets facet 只浏览资产，不显示库管理动作。

## Risks / Trade-offs

- [大目录复制耗时且本次没有暂停/取消] → UI 保持明确忙碌状态，复制在主进程异步执行；后台任务和取消作为后续独立能力。
- [复制中进程退出留下 staging] → staging 使用保留前缀且查询忽略；每次添加前清理本操作自身失败的 staging，不扫描或静默删除其他遗留目录。
- [源目录包含符号链接] → 递归复制不得跟随目录符号链接；检测到符号链接即失败，避免意外复制边界外内容。
- [系统废纸篓调用失败] → 保持原目录不变并向 Renderer 返回可见错误。
- [现有开发工作树包含无关改动] → 只修改本变更文件，聚焦验证；无法执行的全仓门禁记录为剩余风险。

## Migration Plan

1. 升级并测试 v4 共享 contract；preload、IPC、AppHost 同步切换。
2. 实现并接入 runtime 管理路径与 Electron 原生副作用。
3. 接入 Renderer 操作和国际化，再补真实 Electron 场景验证。
4. 回滚时整体回退 v4 contract 和全部调用方；不保留 v3/v4 双路。已导入目录是用户数据，回滚不得自动删除。

## Open Questions

无。当前产品语义确定为“复制导入 + 系统废纸篓”；若改为链接外部目录，应另开设计变更。
