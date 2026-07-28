## Context

Desktop UX ADR 先于通用 Agent Task/Activity 删除和 Engine/client 退役建立，因此其宏观
Home、Project Tabs 与三类 Profile 方向仍有效，但部分执行对象和媒体术语已不是当前
canonical path。当前仓库没有 `apps/neko-desktop`，也没有实现 Desktop Shell 的活跃
OpenSpec；本变更不能把文档整理描述为产品实现。

## Goals / Non-Goals

**Goals:**

- 为顶部 Project Tabs、Home、Project Surface 和 Activity projection 建立唯一信息架构。
- 让所有活动入口继续导航到 Agent、Generation、Cut、Character 或 World 的 owning object。
- 明确三类 Profile 与 Media Library 的目标、现状和不可伪造边界。
- 让当前 Desktop 文档只引用 Node/FFmpeg 媒体路径。

**Non-Goals:**

- 创建 `apps/neko-desktop`、Electron bridge、Project catalog 或持久 Tab schema。
- 创建统一 TaskManager、跨领域 Job registry、Activity command router 或恢复旧 TaskCard。
- 实现 CharacterProject、CharacterVersion、WorldProject、WorldRun 或空壳成功页面。
- 恢复 Workbench Core、Plugin Host、Rust Engine、EngineClient、Market 或旧 Desktop。
- 冻结视觉尺寸、颜色、图标、快捷键或 OS Dock/Windows taskbar 集成。

## Five-Layer Analysis

| 层 | 结论 |
| --- | --- |
| 职责 | Desktop Shell 拥有导航与 projection 组合；Agent/领域 owner 拥有执行事实；Profile owner 拥有项目事实。 |
| 依赖 | Shell 只消费公共 projection/command；不导入 VS Code host、领域私有 store 或旧 Engine/client。 |
| 接口 | 文档区分 ProjectTab/View、Conversation/Run/Tool Call、领域 Job/Run；不发明跨领域 Task DTO。 |
| 扩展 | 插件只能进入既有受控 contribution slot；不能贡献顶层 Tab、全局导航或 Activity authority。 |
| 测试 | 本次以文档链接、术语、状态与 OpenSpec scenario 一致性验证；运行时验收留给 Desktop 实施变更。 |

## Decisions

### 1. 顶部 Tab 只承载 Project 工作集

目标结构是 `[Home] [Content Project] [Character Project] [World Project] [+]`。Home
不可关闭；同一项目在同一窗口只有一个 Project Tab。关闭 Project Tab 只 detach view，
不删除项目、不取消 Agent Run，也不取消任何 owning-domain Job/Run。

Agent Conversation Tab 继续属于 Agent UI，项目内文档由项目树、面包屑或受控 View
switcher 表达。`@neko/ui` 的 tabs/activity/status primitives 可以作为渲染基础，但不拥有
Desktop identity、持久化或生命周期。

### 2. 不建立通用“任务栏”

Desktop 使用分层 Activity/Attention projection：

```text
Project Tab badge
  -> running / needs-review / failed / unsaved attention

Home Activity & Conversations
  -> cross-project read-only summaries and navigation

Project Context Dock
  -> project-scoped Agent / Review / Activity / domain status

Conversation Timeline
  -> Agent Run / Tool Call / Approval

Domain surface
  -> GenerationJob / ExportJob / CharacterRun / WorldRun projection
```

Home 不拥有跨领域 Job 状态机，不提供含义不明的 `cancelTask`、`retryTask` 或
`latestTask`。每个动作携带 owning identity 并委派给对应 public port。底部 Status Strip
若实现，只显示当前投影的紧凑状态和诊断，不成为运行事实 owner。

### 3. 执行身份使用现有 owner

- Conversation 内推理：`ConversationId -> AgentRunId -> ToolCallId`。
- 委派：父 Conversation 下的 `SubagentRunId`。
- 生成：Generation-owned `GenerationJobRef`。
- Cut 导出：Cut-owned `ExportJobRef`。
- 角色互动：Chara-owned `CharacterRunId`。
- 世界运行：未来 World-owned `WorldRunId` / `WorldSaveId`。

不存在通用 `BackgroundWorkId` 或跨领域 Task command router。Home 和 Project 只保存导航
所需的 typed owner ref 与 projection revision。

### 4. 三类 Profile 共享布局语法，不共享事实

| Profile | 当前可复用能力 | 当前缺口 |
| --- | --- | --- |
| Content | Agent、Canvas、Cut、Preview、Generation、Quality、Document/Markdown、Media Library | 统一 ContentProject aggregate、catalog/codec、跨 Surface artifact/review/output contract |
| Character IP | Chara Dialogue/Embody/evidence/profile、Entity、representation binding、Preview | CharacterProject/Version、发布、持久 Run、角色编辑器和完整表现 authoring |
| Interactive World | Character/World 聚合边界和公共 ref 设计 | `neko-world` package、project/version/run/save/replay、规则/事件和 UI |

Profile 名称不是实现证据。缺失能力必须显示 unavailable diagnostic；不得创建空项目或
成功 no-op。

### 5. Media Library 是跨项目资源入口

Home Media Library 继续使用 accepted `ContentLocator` 与 workspace-linked library
contract。项目只引用资源或显式接收 candidate，不复制媒体库 catalog。角色语义由 Creative
Entity/Chara 拥有，World 只引用已发布 CharacterVersion；文件名、缩略图或媒体路径不能成为
角色 identity。

### 6. 当前媒体路径不包含 Engine/client

Desktop 目标调用链只使用：

```text
Desktop renderer
  -> typed preload IPC
  -> Desktop AppHost / domain application service
  -> @neko/media or domain-owned media port
  -> Node/FFmpeg and browser media client
```

Renderer、Host 和领域项目只持有稳定 locator、job/session identity 与短生命周期 descriptor。
历史 Engine Viewport 或 EngineClient 设计不得重新进入当前目标。

### 7. Frontend state 按 authority 和 identity 分层

Desktop 不建立同时拥有领域事实、运行状态、Tabs、layout、draft 和插件数据的全局 store。
Host/domain service 拥有 authoritative fact 与摘要 projection；Renderer 为每个 owner
维护 immutable replica；Window application service 拥有 revisioned layout/Project Tab
binding；每个 View 只拥有 draft、selection、scroll、viewport 等展示状态。

Host projection 采用 snapshot-first attachment：attachment 绑定 endpoint/view epoch、
Window/View 和准确 owner ref；snapshot acknowledgement 后只接受连续 sequence 和匹配
base revision 的 patch。gap、旧 attachment、owner mismatch 或未知 schema fail-visible
并重新附着，不能按到达顺序覆盖。

command 在发起时捕获准确 owner/view identity，携带 command id/idempotency key 和适用的
expected revision。Renderer 只通过 pending intent overlay 表示乐观状态；Host patch
仍是提交结果。关闭/切换 Tab 只失效 view epoch 和 subscription，不能让迟到 response
写入当前 active Tab，也不能把 component unmount 当成 execution cancel。Project badge
与 Home Activity 使用 Host 摘要 projection，不遍历已加载 view 计算。

当前 Agent projection attachment、Conversation replica 和 Tab render runtime 是协议
原型；Desktop 实施应提取 host-neutral primitive，而不是复制 Agent 私有 timeline 或建立
第二套 event bridge。

### 8. Development is gated in three phases

Desktop delivery follows one dependency order:

1. UI/Shell and retained-package integration;
2. real macOS/Linux/Windows platform qualification;
3. the MCP/plugin foundation and professional-tool adapters.

Phase 1 must deliver a real Content workflow through the public Agent, Assets/Content, Canvas, Cut,
Preview/Media, Generation/Quality, Chara/Entity, and Tools/Diagnostics paths. It cannot use empty
Character/World pages, mock domain stores, or no-op success to satisfy the UI milestone.

Phase 2 qualifies the same canonical implementation instead of creating OS-specific product forks.
The current platform set remains `darwin-arm64` and `linux-x64`; `win32-x64` stays deferred until a
separate platform-contract change and real Windows evidence update the closed release matrix.

Phase 3 reuses the single MCP Manager, Tool Call/Approval, Skill, and capability catalog. Plugin
runtime/manifest work precedes vendor adapters. ComfyUI, NLEs, Blender, Unity, Photoshop, and Live2D
enter through separate versioned adapters and truthful capability levels. Stable MCP/vendor API is
preferred; Computer Use is an explicit, target-bound supplement and never a silent fallback.

The root Chinese and English Roadmaps own direction and completion gates. Implementation remains
split across bounded OpenSpec changes; this documentation change does not create Desktop runtime.

## Risks / Trade-offs

- `Activity` 容易再次演化成中央 TaskManager；文档通过只读 projection 和 owner-ref command
  限制该风险。
- Character/World Profile 很容易被空壳 UI 误报为实现；成熟度表和 fail-visible 要求保持显式。
- 现有 Agent Conversation Tab 和未来 Project Tab 都使用“Tab”名称；文档必须始终带限定词。
- 本次不冻结视觉规格；后续 Desktop 实施仍需独立交互稿、可访问性和跨平台运行态验收。
