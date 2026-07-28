## Why

Phase 1 需要一个真实、受约束的 Electron 组合根，才能让后续 Shell 和领域 UI 通过唯一
Desktop path 运行。当前仓库只有 VS Code 与 TUI 应用；`@neko/host` 定义了中立 ports，
但没有 Electron 实现，application contract 仍把已经删除的 `neko-home` 当作合法身份。

如果先用 browser mock、raw IPC 或 VS Code message transport 拼装界面，后续会同时存在
演示路径和真实路径，无法可靠验证窗口生命周期、sender identity、资源释放和 renderer
安全边界。

## What Changes

- 创建 `apps/neko-desktop`，建立 Electron main、preload、renderer 和 app-specific
  serializable contract 四个边界。
- 固定 Electron 安全配置、CSP、窗口注册、sender 校验、reload/close/quit 生命周期与
  fail-visible diagnostics。
- 在 Desktop composition root 实现 `ElectronNekoHostPorts`，复用 `@neko/host` 中立
  contract，不新增万能 HostAdapter 或 Desktop 业务核心包。
- 将 canonical Desktop application identity 收敛为 `neko-desktop`；审计
  `neko-home` 数据后删除其成功解析路径，不保留 alias fallback。
- 建立最小 renderer bootstrap 和隔离 fixture，使 foundation 可以通过 contract、
  architecture 和 Electron 运行态测试验证。
- 本变更不接入 Agent、Assets、Canvas、Cut、Preview，不实现 Project Shell、媒体
  custom protocol、MCP、Computer Use 或专业工具控制。

## Capabilities

### New Capabilities

- `desktop-foundation`: 定义 Desktop composition root、Electron Host、安全 bridge、
  application identity 和基础生命周期。

### Modified Capabilities

- `desktop-phase-1-delivery-plan`: 完成 P1.1 foundation 子变更，并为 P1.2-P1.7 提供
  唯一运行基础。

## Impact

- 新应用：新增 `apps/neko-desktop` workspace。
- 共享契约：`@neko/host` application identity 从未发布的 `neko-home` 破坏性替换为
  `neko-desktop`；VS Code 与 TUI 身份不变。
- 依赖：新增并锁定 Electron 构建、打包和 renderer 依赖。
- 用户数据：只在完成 `NekoApplicationStorageCategory` 审计后移除旧身份；有价值数据
  必须显式迁移或拒绝并诊断，cache 才可重建。
- 当前客户端：VS Code 与 TUI 的构建、运行入口和发布支持不变。
