> Production-scope reconciliation (2026-08-12):
> [`simplify-resource-entity-character-world-boundaries`](../simplify-resource-entity-character-world-boundaries/)
> limits the first production closure to `WorldProject -> WorldVersion -> WorldRun -> WorldSave/branch`,
> exact CharacterVersion actor refs and optional ProjectEntity object association. Story and Experience
> contracts remain unavailable until their complete producer, consumer, persistence and UI paths are
> qualified; this change must not pre-register empty production paths.

## Why

World Foundation 已有最小事实链，但完整 World、World Story 与 World Experience 仍缺少经依赖闭包验证的 package topology、canonical public contracts 和跨 owner 引用规则。先冻结数据边界，避免后续 runtime、Desktop 或 Agent 各自发明 shape。

## What Changes

- 定义 World Definition、World Story、World Experience 的 owner、identity、不可变发布引用、participant/actor binding 和 strict codec。
- 决定真实 package/subpath topology，并添加层级、导入与跨 owner mutation poison tests。
- 定义用户数据清单和 workspace-relative storage contract，不实现 repository、runtime 或 UI。

## Capabilities

### New Capabilities

- `world-topology-and-data-contracts`: World 能力族的 ownership、public contract、codec 与跨 owner 引用边界。

## Impact

- Owner：`@neko/world` 的 host-neutral contract/domain 层；Chara、Agent、Content/Assets 只通过各自 public refs 被引用。
- Consumers：后续 deterministic runtime、World Webview、Desktop adapters、Agent/Gameplay composition。
- Data：只定义 canonical shape 和相对位置，不启用 writer，不改写现有 Foundation records。
