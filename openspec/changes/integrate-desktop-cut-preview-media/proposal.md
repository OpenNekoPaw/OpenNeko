## Why

Desktop 已有受控 Main/Timeline slots 和真实 Resource Browser，但完整 Cut Root、通用 Preview
与媒体 transport 仍绑定 VS Code message/API。若直接挂载现有 Webview，Electron 会绕过
AppHost identity、路径授权、OTIO revision、ExportJob 与媒体资源生命周期，形成第二条不可验收
的成功路径。

## What Changes

- 为 Cut 定义 versioned、browser-safe Host runtime，使完整 Cut Root 通过显式注入消费 OTIO
  document/session、command、preview、export 和 presentation projection。
- 将 VS Code Cut adapter 迁移到同一 runtime，并删除或 poison production Root 对全局
  VS Code transport 的依赖。
- 在 Desktop Main/preload/AppHost 接入 sender-bound Cut namespace；Cut Stage 与底部 Timeline
  由同一个 Cut session 拥有，支持多个打开的 Cut 文档但一次仅渲染一个。
- 接入 package-owned Preview Root 与授权 ContentLocator/media descriptor transport，支持临时、
  固定和显式 side Preview；Canvas/Cut 内嵌预览继续留在所属 surface。
- 让 Resource Browser 的图片/视频显示 Host 投影缩略图，并提供显式“预览”“添加到 Cut”目标
  动作；只向 Renderer 投影 Desktop exact-resource registry 注册的短生命周期
  `openneko://resource` URL，不暴露绝对路径、`file://`、任意 localhost、cache path
  或独立 token 字段。
- 保留 OTIO、Cut command、`@neko/media`、Node/FFmpeg preview、ExportJob 和 Preview package
  作为唯一事实来源；固定 demo timeline/preview 不得返回 production success。

## Capabilities

### New Capabilities

- `desktop-cut-preview-media-runtime`: Desktop 中 Cut/Preview/媒体的 identity、授权 transport、
  多文档 View、Timeline、预览、资源 handoff、导出和恢复行为。

### Modified Capabilities

- 无。

## Impact

- `packages/neko-cut/packages/{domain,webview,extension}`：Host runtime、完整 Root 与 VS Code
  adapter 迁移。
- `packages/neko-preview`、`packages/neko-media`：授权 descriptor、Preview Root 和媒体 transport。
- `packages/neko-assets`：缩略图与显式 Cut/Preview handoff，不新增 catalog/cache。
- `apps/neko-desktop`：Cut/Preview fixed preload namespaces、AppHost composition、Main/Timeline
  surface 与恢复验证。
- `openspec/changes/plan-neko-desktop-phase-1-delivery`：完成 P1.5 后更新 program 5.x。
