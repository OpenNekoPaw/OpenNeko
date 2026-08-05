## Why

Electron Desktop 已组合 package-owned Cut 与 Preview Roots、OTIO session、ExportJob 和授权媒体
资源。该 change 只剩在统一 resource gateway 与完整运行态验收完成后同步 capability 文档和
Phase 1 program，不再维护旧宿主 adapter 目标。

## What Changes

- Cut/Preview package public application entries own document/View/session lifecycle；Desktop Main 以
  sender-bound identity 注入授权 resource/native adapter 并组合、投影和释放 runtime。
- Renderer 只消费 package-owned Roots 与短生命周期授权 resource descriptors。
- OTIO、Cut commands、Node/FFmpeg、ExportJob 与 Preview package 保持唯一 authority。
- demo、全局 bridge、raw path、private scheme、loopback proxy 和 retired-host transport 不能成功。
- 完成后同步当前 capability 文档与 Phase 1 P1.5 状态。
- EPUB waterfall 首屏只加载和测量可见章节及邻近预取范围，不在后台遍历整本书抵消动态加载。

## Capabilities

### New Capabilities

- `desktop-cut-preview-media-runtime`: Desktop Cut/Preview 的 identity、授权资源、多文档、Timeline、
  handoff、export 和恢复行为。

### Modified Capabilities

<!-- None. -->

## Impact

- `apps/neko-desktop` Main/preload/renderer Cut/Preview composition。
- `packages/cut/*`、`packages/preview/*`、`packages/media` 和 Assets handoff。
- `packages/preview/webview` EPUB waterfall virtualization 与真实 Electron 大文件预览验收。
- 不保留 VS Code/Engine compatibility 或第二条媒体 transport。
