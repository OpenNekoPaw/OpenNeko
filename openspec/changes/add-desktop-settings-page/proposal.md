## Why

Desktop 当前把“设置”操作直接映射到 Agent 拥有的 `config.toml`，既没有应用级设置页面，也错误地暗示 Agent 配置可以承载主题、语言与创作工作台偏好。需要建立独立的 Desktop 设置 authority，让应用配置、Agent 配置和项目事实各自归属明确，并为用户提供统一但不混写的设置入口。

## What Changes

- 新增独立的 Desktop 设置页面，Home 与项目工作区使用同一入口和页面，不再以打开 `config.toml` 代替应用设置。
- 新增版本化 Desktop 用户偏好契约和 Host 持久化，首批覆盖外观主题、应用语言、启动目标与资源浏览默认视图。
- 设置变更通过 preload/IPC 的受控 Desktop bridge 读取和更新，并即时投影到现有 renderer；renderer 不直接访问文件系统。
- Agent 分类继续复用 Agent 自己的配置 authority，并提供进入高级 Agent 配置的入口；Desktop 用户偏好不得写入 `config.toml`，Agent 设置也不得写入 Desktop 配置。
- 项目级设置继续由项目事实和相应领域 owner 管理，不写入用户级 Desktop 配置。
- 为未知 schema/version、非法设置值、持久化失败与跨 authority 污染提供 fail-visible diagnostic 和回归测试。

## Capabilities

### New Capabilities

- `desktop-application-settings`: 定义 Desktop 独立设置页面、用户级偏好契约、Host 持久化、运行时投影，以及 Desktop、Agent、项目三类配置 authority 的边界。

### Modified Capabilities

<!-- No accepted capability requirements are modified. Light remains the product default, while the settings capability adds explicit system/light/dark selection. -->

## Impact

- `apps/neko-desktop/src/shared/`：新增版本化设置 contract 与 bridge DTO。
- `apps/neko-desktop/src/main/`：新增 Desktop 设置 repository/service，并接入 AppHost 生命周期与 IPC。
- `apps/neko-desktop/src/preload/`：暴露最小 settings bridge。
- `apps/neko-desktop/src/renderer/`：新增独立设置页、导航状态与主题/语言/工作台偏好投影。
- `packages/neko-agent` 的配置文件、provider credential 和 Agent runtime authority 保持不变；Desktop 仅调用其公开配置入口。
- Desktop 单元/集成测试、Electron production package 与真实 macOS 运行态验收。
