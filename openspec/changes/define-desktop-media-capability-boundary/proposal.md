## Why

OpenNeko 已决定拟议 Desktop 使用 Electron 组合现有领域包与 `@neko/media`，
但现有文档尚未区分“解除 VS Code Webview 宿主限制”和“解除 Chromium
媒体/色彩限制”。如果把 Electron 中 `<video>` 能打开文件等同于 10-bit、HDR、
格式兼容或专业监看正确，后续实现会绕过现有 probe、硬件 preparation、PCM、安全授权和
显式能力矩阵。

本变更只定义 Desktop 媒体、色彩、按需读取和 CSP 的目标边界及运行态验证要求，
不创建 `apps/neko-desktop`，不改变当前 VS Code 媒体路径。

## What Changes

- 明确 Electron 可以移除 VS Code Webview 特有的 URI、CSP 和宿主资源限制，但
  renderer 仍使用 Chromium 媒体与合成管线。
- 区分 source decode、preview output 和 export fidelity，禁止用“能播放”证明
  10-bit/HDR 输出正确。
- 为 Desktop 选择安全自定义媒体协议作为目标按需读取路径，并保留 Range、token、
  owner、取消和生命周期约束。
- 规定原生 `<video src>` 是唯一 renderer 视频路径；其他格式继续由 FFprobe/
  FFmpeg 显式选择 direct、remux、平台硬件 prepared file 或拒绝。
- 保留严格 CSP、sandbox、context isolation 和 `webSecurity`；不得通过
  `bypassCSP`、`file://` 或关闭安全策略解决媒体访问。
- 增加按目标 Electron/Chromium、OS、架构、GPU、显示器和 FFmpeg 构建执行的
  Desktop 媒体验证矩阵。

## Capabilities

### New Capabilities

- `desktop-media-capability-boundary`: 定义 Desktop 的媒体 transport、10-bit/HDR、
  direct codec、CSP 和资格验证边界。

### Modified Capabilities

无。当前没有 Desktop runtime 或稳定 Desktop spec；本变更不修改运行时 contract。

## Impact

- 架构文档：新增 Desktop 媒体能力 ADR，并更新 Desktop composition、媒体运行时
  和架构导航。
- 当前实现：无代码、格式、配置、安装或用户数据变化。
- 后续实现：必须以独立 OpenSpec 创建 Electron protocol adapter、capability
  snapshot 和打包运行态验证，不能把本文描述为已实现能力。
