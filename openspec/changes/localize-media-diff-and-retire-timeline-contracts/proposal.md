## Why

Electron Desktop 保留图片、音频、视频比较与 Media Info，但取消/超时/释放和真实 Desktop viewer
路径仍需完成。旧 Timeline/NKV/伪 Proto contract 已退出，不再保留其迁移历史。

## What Changes

- Tools media comparison 使用 package-owned L0 contract 与窄 Node/FFmpeg port。
- ratio、diagnostic、cancel、timeout、concurrent session 和 cleanup 保持 truthful/fail-visible。
- Cut 使用 OTIO projection，Canvas 使用 NKC contract，Agent 使用只读 owning projection。
- NKV/Timeline Diff/EngineDiff/伪 Proto generator 和 fallback 不能重新进入当前路径。
- 完成 process cleanup tests 与隔离 Electron image/audio/video/Git/Media Info 场景。

## Capabilities

### New Capabilities

- `tools-media-comparison`: Desktop media comparison、Media Info、生命周期与 renderer contract。
- `legacy-timeline-contract-retirement`: 当前代码禁止 NKV/old Timeline/伪 Proto 成功路径。

### Modified Capabilities

<!-- None. -->

## Impact

- Desktop Tools Main/preload/renderer、`@neko/media` Node adapter 和 Cut/Canvas/Agent contracts。
- 用户文件不迁移、不改写、不删除。
