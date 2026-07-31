## Why

Desktop 全局内容库当前只提供固定卡片布局和文本图标，目录依赖显式“浏览/打开目录”按钮，
目录枚举还会投影 `.DS_Store` 等点号隐藏项。独立 Asset Library 也只有只读搜索，无法完成
素材导入、缩略图浏览和安全删除，用户不能在同一处有效管理全局创作素材。

## What Changes

- 为全局 Media Library 和 Asset Library 提供一致的列表/网格布局、稳定缩略图、悬停静态预览、
  搜索、排序和无布局跳动的加载状态。
- 过滤所有 basename 以 `.` 开头的文件和目录，并在根搜索、递归搜索和逐层目录浏览中使用同一
  canonical visibility policy。
- 用单击选择、双击/键盘打开目录和面包屑导航替换媒体库卡片上的“浏览/打开目录”按钮；连接管理、
  重新定位和在文件管理器中显示继续使用显式命令。
- 为 Asset Library 增加原生文件选择导入和安全删除；导入把素材复制到 Asset Library 拥有的
  存储，删除把已确认的 owned asset 移入系统废纸篓。
- 保持 Media Library 与 Asset Library 生命周期隔离：移除媒体库只移除连接，资产删除命令不得
  操作外部媒体库文件。
- **BREAKING**：升级 Desktop Home Management contract，使用新版本的精确 item、thumbnail、
  import/remove 和 revision payload；旧版本请求必须 fail-visible，且不保留兼容成功路径。

## Capabilities

### New Capabilities

- `desktop-global-library-browser`: 定义全局媒体库/资产库的列表与网格展示、目录导航、隐藏项策略、
  缩略图和悬停静态预览行为。

### Modified Capabilities

- `global-media-library-connections`: 补充连接目录的可见项规则、无按钮目录导航和缩略图投影约束，
  同时保持外部目标只读浏览与连接移除语义。
- `creative-asset-library-management`: 从只读浏览扩展到 owned asset 的显式导入、安全删除、缩略图
  投影和严格身份验证。

## Impact

- 受影响代码：`neko-assets` content-tree/presentation contract、Desktop Home Management contract、
  preload/IPC/AppHost、`DesktopResourceBrowserRuntime`、Electron 原生文件选择/缩略图/废纸篓 adapter、
  Home Asset Center UI、设置投影、i18n 与测试。
- 复用现有 Resource Browser 懒加载缩略图、列表/网格模式和 Desktop Preview/媒体运行时；不新建
  catalog、cache manager、文件路径 resolver 或第二套媒体播放组件。
- Renderer 继续只接收 opaque item/thumbnail identity、媒体类型和安全显示字段，不接收绝对路径、
  link target、凭据、Webview URL、trash path 或 FFmpeg 进程信息。
- 用户数据：媒体库外部目标始终不被复制或删除；资产导入产生新的 owned bytes；资产删除进入系统
  废纸篓并必须由用户显式确认。现有资产和连接不做自动迁移或清理。
