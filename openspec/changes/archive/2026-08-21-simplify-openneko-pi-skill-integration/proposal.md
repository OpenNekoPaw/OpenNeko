## Why

OpenNeko 已依赖 Pi Agent 的标准 Skill discovery、progressive disclosure 与 invocation，但当前代码又定义了重复的 Skill contract、Host overlay、target/binding metadata、Skill-specific processor 和 command-artifact 分支，形成了没有真实消费者的第二套 Skill 平台。现在需要把边界收敛为“Pi Skill canonical runtime + OpenNeko thin Host/UI adapter”，避免继续扩大专有格式、专属执行路径和多目录 authority。

## What Changes

- **BREAKING** 删除 OpenNeko 重复且无生产消费者的扩展 Skill 模型，包括 Tool definition injection、model/path override、media workflow DSL、catalog hierarchy、host-fit/quality envelope 和 `agents/neko.yaml` overlay。
- **BREAKING** 删除 `openneko.binding`、`openneko.authoring-target-kind` 及 Skill invocation target selector；Workspace、Character、World 等 target 只由 Conversation/Launch authority 与当前 Capability Tool snapshot 决定。
- 保留 Pi Agent 作为唯一 Skill loader、validator、progressive disclosure 与 prompt-formatting path；OpenNeko 只组合 builtin、personal、project、plugin roots，并补充 trust、enablement、provenance、fingerprint、exact activation 与 opaque resource locator。
- 将 management inventory 与 executable Skill record 分离；安装/启停/移除事实不得直接充当 executable identity。
- **BREAKING** 从 SkillHost 删除无生产消费者的 Skill external processor API；Skill 附带脚本只能通过普通 Host Tool/permission path 执行。
- **BREAKING** 将 `command-artifact` 从 SkillHost 分离为独立 Command discovery/invocation owner；Skill 与 Command 可以共享底层 Markdown/source utilities，但不共享 record、collision 或 execution identity。
- 固定 Portable Skill 路径为用户级 `~/.agents/skills` 和工作区 `.agents/skills`；`~/.neko` 继续保存 OpenNeko 专属配置、状态、Prompt、Command、缓存和日志，工作区 OpenNeko 项目事实继续位于 `neko/`。
- 删除生产无消费者的 `.neko/skills` layout；既有 `~/.neko/skills` 或工作区退役 `.neko/` 字节保持不变，正常运行不读取、不迁移、不删除，未来只能通过用户显式导入操作复制到 canonical Skill root。
- 收紧 Skill 创建结果与 API，只返回执行/管理所需的稳定 identity，不向 Agent 或 Renderer 投影绝对路径、永远为空的 diagnostics 或无消费者 root metadata。

## Capabilities

### New Capabilities

- `pi-skill-host-integration`: 定义 Pi Skill 的唯一运行路径、OpenNeko thin Host extension、ordinary Skill invariant、exact activation、Command 分离及 Capability/Conversation ownership。
- `portable-skill-management`: 定义 personal/project Skill roots、管理与执行 catalog 分离、原子创建/安装/移除、`.neko` 数据边界及 retired Skill 数据处理。

### Modified Capabilities

<!-- None. Existing local-storage authority requirements already require retired workspace `.neko/` bytes to remain product-unreachable and untouched. -->

## Impact

- `@neko/agent-runtime` owns the thin Pi SkillHost adapter, exact executable catalog and CommandHost separation; it must not own domain authoring targets, Skill-specific execution or a second Skill parser.
- `@neko/agent-contracts` is reduced to minimal cross-runtime Skill/Command catalog, invocation and creation contracts; unused business projection and overlay types are removed in coordination with `purify-agent-contracts`.
- `@neko/chara` retains the generic Character authoring Capability and exact mutation authority, but removes Skill-branded provider identity and any dependency on `character-creator` metadata.
- `@neko/agent-webview` and `apps/neko-desktop` retain management/search/internationalized presentation and Desktop trust/file adapters; Renderer no longer derives authoring target UI from Skill metadata.
- `@neko/local-metadata` continues to own `~/.neko` global storage layout while explicitly projecting Portable Skills under `~/.agents/skills`; the obsolete generic `.neko/skills` layout export is removed.
- `packages/skills` remains content-only and Pi-compatible. Builtin Skill content is audited against the existing prompt/capability boundary without adding OpenNeko runtime protocols.
- Active changes `unify-agent-launch-and-domain-bindings`, `clarify-desktop-capability-catalog`, `purify-agent-contracts` and the completed `unify-skill-creator-authoring-targets` must consume this single canonical boundary rather than retain compatibility paths.
> **后继处置（2026-08-21）**：Pi Skill integration 已由 DSH standard preset 与 DSH Skill runtime 取代；本文仅保留历史证据。
