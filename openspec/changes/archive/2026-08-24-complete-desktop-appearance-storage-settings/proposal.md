## Why

Desktop Settings 当前只投影主题、语言和资源视图，无法查看真实数据位置、占用量或为新项目选择默认目录；字体偏好也缺少覆盖完整 Window UI 的实现。

## What Changes

- 在现有 Renderer-owned Settings overlay 中补全“外观与语言”和“数据与存储”。
- 增加全窗口字号偏好，并从 Renderer 根节点应用统一 UI scale/token。
- 由 Desktop Main 投影应用数据、已注册项目与媒体库的真实位置、占用量和局部诊断，并提供按受控目标打开目录。
- 默认工作区目录只影响之后的新建项目，不移动或改写已有项目。

## Capabilities

### New Capabilities

- `desktop-storage-settings`: Desktop 数据位置、占用量、打开目录与新项目默认目录设置。

### Modified Capabilities

- `desktop-settings-responsive-presentation`: 增加字号与存储内容，但保持 overlay 所有权和无额外 header。

## Impact

- `@neko/host/application-settings` 拥有偏好 contract 与持久化；新增字号和 canonical 默认工作区 locator。
- `apps/neko-desktop/src/main` 仅实现文件系统统计、目录选择/打开和 HOME locator 解析等 Electron/Node trust-boundary adapter。
- `apps/neko-desktop/src/renderer` 只渲染 projection、提交 typed intent，并在根 UI 应用字号。
- 不移动、不删除用户数据；已有项目 locator 保持不变。
