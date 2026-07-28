# OpenNeko Desktop

`apps/neko-desktop` 是 OpenNeko 的 Electron 应用组合根。

当前已完成 Phase 1 的 P1.1 Desktop foundation 和 P1.2 Shell/Project state：

- 安全的 main/preload/renderer 边界、Electron Host ports、应用身份和退出生命周期；
- Home、Content Project Tab、Context Dock、Activity/Attention 空投影；
- canonical Workspace/Project identity、Window/Tab/View state、CAS persistence；
- sender-bound fixed IPC、renderer epoch/revision 检查和 restart recovery；
- Character/World、Agent、Canvas、Cut、Preview 的明确 unavailable 状态。

Agent、Assets/Media Library、Canvas、Cut、Preview 和其他领域 runtime 尚未接入；当前
Desktop 是 Phase 1 开发基线，不是已发布产品。

```bash
pnpm --filter @neko/app-desktop typecheck
pnpm --filter @neko/app-desktop test
pnpm --filter @neko/app-desktop lint
pnpm --filter @neko/app-desktop package
pnpm --filter @neko/app-desktop dev
```

`darwin-arm64` 开发包使用 ad-hoc 签名，并保持 sandbox、CSP、ASAR integrity、安全 fuses，
同时关闭 `file://` extra privileges。Electron V1 fuse 使用严格完整配置：
`LoadBrowserProcessSpecificV8Snapshot` 保持关闭，因为 Electron `43.2.0` macOS 分发包不包含
browser-specific snapshot；其余安全取值均显式固定，包括启用 `WasmTrapHandlers`。
Electron `43.2.0` 的参考平台归档 checksum 已固定，package 可直接校验本地缓存而不重复下载
`SHASUMS256.txt`。Developer ID、hardened runtime、notarization、installer 和 release
channel 属于 Phase 2。
