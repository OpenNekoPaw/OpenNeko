## Context

当前 Canvas 同时拥有通用空间编辑、Storyboard 生产、Narrative runtime graph、Behavior/Entity/Memory 占位节点、文件分类和媒体生成审阅。节点类型不仅控制展示，还被 Extension command、Agent capability、prompt builder、entity backfill、PlaybackWorkspace 和 Workspace Board 写入路径直接分支。只隐藏节点目录会保留多套事实来源，也无法满足 prelaunch canonical path 要求。

本变更按五层分析：

- 职责：Canvas 只拥有布局、通用节点投影、连接和选择；Job、Character、媒体资源和文件内容由各自 owner 持有。
- 依赖：共享 Canvas contract 位于 `@neko/shared`，Canvas domain/Webview/Extension 单向消费；Agent 通过公共 API 和 stable refs 接入。
- 接口：节点 renderer 只消费六种 canonical node data；来源添加使用显式 creation intent，不再把 picker hint 等同 node type。
- 扩展：Media variant 和未来 Character contribution 通过 catalog entry/capability 扩展，不扩张基础 schema。
- 测试：迁移、validator、Agent authoring、Workspace Board、Webview renderer/目录、Playback 和 Extension command 均需路径断言。

## Goals / Non-Goals

**Goals:**

- 为 AI 创建、投影和整理内容提供最小、稳定、可组合的 Canvas vocabulary。
- 删除领域占位节点和旧 Storyboard/Narrative authoring 成功路径，同时保留通用 Preview workspace、播放控制和 route/storyboard matrix。
- 保持 Markdown、媒体、文件、子画布、分组和 Job 的完整创建、持久化、连接与预览能力。
- 保持节点变换、锁定、属性、端口、连接、Markdown 编辑/渲染、媒体来源展示和快速生成等原有通用创作能力。
- 保护已有本地 `.nkc`，通过单次显式迁移收敛到新格式。

**Non-Goals:**

- 不实现 Character、World、Dialogue Lab 或世界运行时。
- 不把 Job queue/session/runtime 生命周期搬进 Canvas。
- 不从任意 Markdown 文本猜测镜头、分支、Character 或执行状态。
- 不保留 Basic/Professional、旧 subsystem registry 或双 renderer。
- 不重写、替换或降级原有 Preview workspace、matrix、媒体播放和 Engine stream runtime。
- 不删除通用编辑或快速生成入口；快速生成只迁移执行 owner，不迁移用户能力。

## Decisions

### 1. Six canonical node types

```text
markdown
media(kind=image|audio|video)
group
job
file
canvas-embed
```

`markdown` 使用单一 Markdown body，不再保留 plain text、annotation、storyboard note 或 script-specific Canvas schema。`media` 保存稳定 ResourceRef 和明确 media kind；图片、音频、视频只在目录创建 intent 和 renderer variant 上不同。`file` 保存普通文件 ResourceRef、media type 和展示摘要。`canvas-embed` 保留显式 `.nkc` identity 与打开行为。

`job` 保存 `jobId + revision`、显示摘要、状态和 stable input/output refs。Canvas 不根据 JobCard 重建队列，不拥有重试、取消或恢复状态；命令必须携带显式 job identity 调用 owning service。

### 2. Add actions are not node types

Canvas 不保留常驻右侧节点目录。左侧工具栏“添加”弹层和画布右键菜单消费同一份稳定 action catalog：

```text
create.markdown  -> create empty markdown
create.group     -> create empty group
import.image     -> bind media(kind=image)
import.audio     -> bind media(kind=audio)
import.video     -> bind media(kind=video)
reference.file   -> bind file
reference.canvas -> bind canvas-embed
```

这样 UI 可以分别展示图片、音频和视频，而 `.nkc` 不复制三套媒体 schema。只有 Markdown 和 Group 具有合法空状态；来源型动作必须成功绑定来源后再创建节点。JobCard 是 owning Job service 发布的投影，不进入用户添加目录。Basic/Professional 状态、subsystem loading 和右侧 catalog Dock 被删除。

弹层点击在当前可见视口中心创建；右键菜单在指针位置创建；文件拖放在投放位置创建。弹层不承担持久浏览或属性编辑职责。未来 action 数量达到需要检索的规模时，可将同一 catalog 投影为可搜索命令面板，但不得引入第二份目录事实来源。

### 3. Group is the only visual container

Group 使用 `container.childIds` 和一个通用 layout policy。Scene、Artboard 和 Gallery 的容器职责迁移到 Group；顺序由 Group 的显式 child order 或 `sequence` connection 表达。不得同时用 `child` connection 表达同一成员关系。

### 4. Three connection meanings

- `sequence`：用户明确的阅读或播放顺序。
- `reference`：一个节点消费、提及或绑定另一个节点。
- `derived-from`：输出由输入产生的 provenance。

连接 type 为必填。删除 default、choice、transition、child、association 以及 condition/priority/weight/decay 等 subsystem 字段。连接方向、标签、端点和可点击命中区域保留；默认新建为 `reference`，只有明确的排序和 provenance 操作创建其他类型。

### 5. Migration is a one-way load-boundary replacement

旧 schema 只允许在 `.nkc` codec/load 边界出现，并按旧 discriminator 映射：

- Text/Annotation/Storyboard/Script/NarrativeNote -> Markdown。
- Media/Gallery/GeneratedAsset -> Media；无法选出单一资源的 Gallery 转为 Group，并投影每个稳定资源为 Media child。
- Document/Model/Project -> File。
- Scene/Shot/Artboard -> Group、Markdown、Media 的组合。
- CanvasEmbed -> CanvasEmbed。
- Narrative/Behavior/Entity/Memory runtime-only state 不进入新 Canvas；可提取的人类可读内容转为 Markdown，其余产生 migration diagnostic。

迁移成功后保存只写新 schema/version。生产 renderer、factory、Agent catalog、Preview 和 Extension handler 不接受旧 node type。不得运行时 fallback 到 legacy subsystem。

### 6. Generic nodes adapt into the existing Preview workspace

节点模型简化只改变 playback plan 的输入投影，不改变 Preview workspace 自身的交互与运行边界。Markdown、Media 和 Group 由 generic adapter 投影为 `CanvasPlaybackPlan`；原有 stage、route tabs、route/storyboard matrix、尺寸调整、焦点、播放控制、进度保存与 surface handoff 必须继续存在。Job 和 File 展示状态或打开来源，但不作为可播放单元。

音视频播放的 canonical path 保持为 `Canvas Webview -> typed host message -> Canvas Extension -> Engine media service -> @neko/neko-client stream lifecycle`。Webview 原生 `<audio>` / `<video>` 不得成为替代实现或 fallback。复杂叙事由 owning Job 生成带 schema/version 的显式 artifact；Canvas 不从空间位置或任意 Markdown 猜测分支，但这不构成删除 matrix 或 Preview 工作区的理由。

### 7. User-facing Canvas actions are localized

Canvas Webview 使用宿主 locale 投影所有用户可见的添加分组、动作、动态状态和无障碍标签。action catalog 只保存稳定 key，不保存显示文案。英文与简体中文 bundle 必须具有相同 key 集合；缺失 key 在测试和开发期 fail-visible。

持久 Canvas 数据不得写入由当前 locale 生成的默认名称。节点只保存用户输入或稳定状态码，renderer 按当前 locale 生成空状态、Job status 和类型标签。

### 8. Generic editing and quick generation remain capabilities

六类节点继续使用原 Canvas interaction frame：选择、拖动、缩放、旋转、锁定、复制、删除、Group 管理、属性和端口编辑保持可用；三类连接继续保留命中、方向、标签和类型编辑。Markdown 节点在选中时编辑源码，非编辑状态使用共享 Markdown renderer。

原生成来源浮条与快速生成入口继续存在。入口提交显式 `nodeIds`、可选 prompt 和 media modality，经 Canvas Extension 先投影 Agent context，再通过 Agent command 创建并运行 Job。Job/Agent 拥有 provider、调度、任务状态和产物生命周期；Canvas 只展示 JobCard/Media 结果和 provenance。不得恢复 Canvas-owned Shot/Scene executor，也不得让快速生成退化为无行为按钮。

## Risks / Trade-offs

- [旧 Storyboard/Narrative 能力不再直接可编辑] → 在迁移报告中保留可读文本和稳定媒体，复杂运行图明确标为不支持，不用旧路径伪装成功。
- [现有 Preview 输入曾依赖 Shot/Scene] → 只替换 playback input adapter 为 generic content/Job refs；保留中立的 plan、matrix、stage、控制器和 Engine stream 消费能力，并用路径测试证明旧 authoring type 未参与。
- [Generic Markdown 减少结构化字段] → 需要确定性执行时由 Job 产出独立 schema/version artifact，不能解析自由文本。
- [Character 暂时不可添加] → 目录不显示占位入口；角色领域 contract 落地后通过新的 capability contribution 加入。
- [迁移可能扩大 Group/Media 节点数量] → 使用确定性 ID、坐标和 provenance，保证重复加载不重复迁移。
- [移除常驻目录会失去拖拽创建] → 点击添加在视口中心创建，右键与文件拖放分别保留精确位置创建；当前动作数量不值得保留 220–420px 常驻 Dock。
