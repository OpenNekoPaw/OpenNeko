## Why

Electron Desktop Preview 已具备 purpose-aware 3D reference staging、内置 guide presets、capture 和
Agent/Canvas handoff，但 lazy bundle ownership、camera/light direct manipulation、完整 Electron
functional matrix 与真实来源模型路径仍未最终验收。

## What Changes

- Preview owns one temporary 3D reference session with appearance, pose/depth, camera and panorama roles。
- 内置 mannequin/guide 通过 Desktop resource gateway 惰性加载，按 catalog identity/fingerprint 授权。
- Camera 与固定 key/fill/rim directional rig 通过 scene tree、可识别 viewport object 和直接拖拽
  调整，不增加持久 3D project 或物理灯光 authoring。
- 输出使用 revisioned purpose contract 和稳定资源 identity；Preview 不选择 provider 或提交生成。
- 完成 isolated Electron scenarios、bundle/render/disposal measurement 和正常 Agent input handoff。

## Capabilities

### New Capabilities

- `3d-reference-staging`: Preview session、四类 purpose、camera/light/panorama、isolation 与 lifecycle。
- `builtin-3d-reference-presets`: code-owned preset catalog、授权、lazy load 与 provenance。
- `3d-reference-delivery`: purpose-aware output、provider capability validation 与 no-fallback delivery。

### Modified Capabilities

<!-- None. -->

## Impact

- Desktop Preview Main/preload/renderer、Three.js scene、resource gateway、Agent context 与 Canvas/media routing。
- 不建立 Rust Engine/Unity/native renderer、持久 3D project、raw path 或 retired-host resource path。
