## Why

Electron Desktop 已接通 Assets Resource Browser、workspace-linked libraries、Canvas authoring 和
Workbench composition；剩余工作是对当前 shared UI/Canvas/resource path 做最终 focused 验收。

## What Changes

- Desktop Main 提供 sender-bound Assets/Canvas ports；renderer 不拥有文件、索引或 project facts。
- Assets Root 复用 ContentLocator、Media Library、Entity/Search 和 local metadata。
- Canvas Root 通过 canonical host adapter 使用唯一 `.nkc` document/session path。
- Resource Browser → Canvas、candidate/accept、Workspace Board、hover preview 和双 View 均通过
  package-owned contracts，禁止 demo/global bridge、raw path 和 retired-host fallback。
- 完成 shared UI/Canvas tests、typecheck、strict OpenSpec 和 Electron runtime evidence。

## Capabilities

### New Capabilities

- `desktop-creative-workbench-layout`: Desktop 主侧栏、Main、Agent Dock、Resource Dock、Timeline
  与受控 Canvas View composition。
- `desktop-assets-canvas-integration`: Assets browser、Desktop content port、Canvas authoring、
  persistence 与 canonical path。

### Modified Capabilities

<!-- None. -->

## Impact

- `apps/neko-desktop` Workbench/Main/preload/renderer。
- `packages/assets/domain`、`packages/canvas/*`、shared UI 与 resource gateway consumers。
- 不保留 VS Code TreeView/Custom Editor 兼容目标或第二套资源 catalog。
