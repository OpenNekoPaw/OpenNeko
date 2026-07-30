## Why

Desktop 当前把 `~/.neko/assets` 的目录同时解释成“媒体库”和“资产”，并把添加媒体库实现为复制目录到资产根。这错误地合并了两个生命周期：媒体库应配置并管理外部文件位置，资产库应拥有可分发、共享的创作素材。

## What Changes

- **BREAKING**：删除“导入媒体库会复制到全局资产根”的路径；添加媒体库改为连接用户选择的本地目录、已挂载 NAS 目录或云盘同步目录。
- **BREAKING**：移除媒体库只删除 OpenNeko 的连接，不移动或删除外部目录及其中的文件。
- 将媒体库连接存储与资产库物理存储分离；媒体库查询只来自已配置连接，资产查询只来自资产库 owner。
- 媒体库连接投影显示位置类型、在线状态与文件入口，并支持添加、移除、重新定位、刷新和显式文件管理。
- 资产库保持独立素材管理语义，为后续分发、共享、版本和授权能力保留独立契约；不复活已退役的 AssetEntity/catalog runtime。
- Home Management contract 升级并拒绝旧的复制/废纸篓 mutation payload，不保留兼容成功路径。

## Capabilities

### New Capabilities

- `global-media-library-connections`: 用户级媒体库连接、外部目录安全边界、文件投影和连接移除语义。
- `creative-asset-library-management`: 独立的创作资产库边界、素材所有权以及未来分发共享扩展点。

### Modified Capabilities

- `media-library-resource-entry`: Media Library 继续作为文件资源入口，但不再禁止独立的创作 Asset Library；文件投影不得创建资产库成员关系。

## Impact

- 受影响代码：Desktop Home contract、preload/IPC/AppHost、Resource Browser runtime/source、Electron 文件连接 adapter、Asset Center UI、i18n 和测试。
- 用户数据：上一版已经复制进 `~/.neko/assets` 的目录不会自动删除或迁移；它们继续作为资产库内容显示，用户需显式配置原外部目录成为媒体库。
- 依赖与安全：不新增云 provider 或 credential runtime；本地、NAS 和云盘先通过宿主已挂载/已同步且真实可访问的目录连接。远程 URL 在没有 provider owner 时 fail-visible。
