## Context

Global Character snapshot 已包含完整 immutable CharacterVersion definition。Management detail 目前只读取 label、
summary 和 version metadata，导致现有数据不可见。Character representation defaults 与 voice defaults 由 Chara
拥有；Chat provider/model 是 Agent Conversation/turn 的运行配置，不能提升为 CharacterProject 全局事实。

## Goals / Non-Goals

**Goals:**

- 在一个只读 detail surface 中预览 selected exact version 的核心定义与表现配置。
- 让缺失、未配置、引用列表和默认引用一眼可辨，并保持长内容可滚动。
- 保持 Character 编辑只在 owning Workspace authoring flow。

**Non-Goals:**

- 从管理页修改、发布或删除 Character facts。
- 在 CharacterVersion 中新增 LLM provider/model 字段，或把当前 Agent 设置伪装成版本事实。
- 解析、加载或渲染 Live2D/VRM/MMD 文件本体；本次只展示 owner-qualified reference metadata。

## Decisions

### 1. 直接投影 selected immutable CharacterVersion

Webview 从现有 snapshot 根据 exact `selectedCharacterVersionId` 选择 version，并分区渲染 definition。不得建立
第二 detail DTO、cache 或 Main IPC。切换 selector 只更新 package-owned presentation state。

### 2. Representation/model 与 TTS 分区展示

Representation 区显示 kind、reference identity/label/source locator 与每种 kind 的 selected default。Voice/TTS
区显示 provider reference、voice representation、speed 与 auto-read。UI 使用“表现模型”避免与 Agent LLM 混淆，
并注明 LLM provider/model 在创建后的 Conversation 中查看和调整。

### 3. 只读语义可测试

页面不渲染文本输入、保存、发布或编辑入口。长文本采用语义化 section/list 与滚动容器，不依赖 tooltip 承载
authoritative 内容。可选值缺失使用明确的 locale 文案，不改变源数据。

## Ownership and Runtime Path

| Responsibility       | Owner / public entry                    | Producer                | Consumer             | Boundary             | Replaced path                   |
| -------------------- | --------------------------------------- | ----------------------- | -------------------- | -------------------- | ------------------------------- |
| Immutable facts      | `@neko/chara` CharacterVersion          | global snapshot service | Chara Webview detail | typed IPC projection | summary-only view               |
| Detail presentation  | `@neko/chara-webview` management detail | selected version state  | Desktop user         | Renderer/Webview     | opaque version selector         |
| LLM execution config | Agent Conversation/turn                 | DSH runtime             | Agent interaction UI | Agent runtime        | no Character-global model field |

## User Data Impact

纯只读投影；不新增持久字段，不迁移或写回 Character 数据，不解析本地 representation 文件。

## Evaluation Decision

该变更不改变模型行为，不新增 provider-backed Agent Evaluation case。使用 component functional checks 与可见 Desktop
detail screenshots 验证信息覆盖、只读约束、滚动和相邻 Start Conversation/Export actions。
