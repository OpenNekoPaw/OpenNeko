# ADR: Canvas 预览路线与 Cut 剪辑时间线边界

状态：Accepted
日期：2026-06-24
范围：`neko-canvas`、`neko-cut`、`neko-preview`、`neko-agent`、共享类型契约、`.nkc` / `.nkv` 项目文件关系。

本文记录 Canvas 播放顺序、预览路线、Cut 时间线和 Agent 操作能力之间的稳定边界。它补充 [`package-boundaries.md`](package-boundaries.md)、[`proto-and-wire-contracts.md`](proto-and-wire-contracts.md)、[`adr-ui-domain-panels-and-shared-primitives.md`](adr-ui-domain-panels-and-shared-primitives.md) 和视频领域架构 [`../domains/video/architecture.md`](../domains/video/architecture.md)。

## 背景

Canvas 已经通过容器、节点、连线和 playback metadata 表达一组播放顺序。Cut 则拥有真正的视频编辑 timeline、轨道、clip、效果、字幕、音频和导出能力。两者都可能出现“时间线形态”的 UI：

- Canvas 需要让用户看懂 scene / shot / media 的播放路线、当前段、分支和缺失素材。
- Cut 需要让用户进行剪辑、编排、调时长、加转场、做字幕音频和导出。
- Agent 需要读取和展示顺序，并在用户确认后把 Canvas 的当前路线发送到 Cut 形成可继续剪辑的初稿。

如果 Canvas 直接复用 Cut timeline 组件或 Cut 编辑协议，会产生几个问题：

1. Canvas 会被拉向视频剪辑器职责，重复 Cut 的领域模型。
2. Canvas 播放顺序和 Cut timeline 顺序会形成双事实源。
3. Extension Host 可能退化成高频 UI 事件代理，破坏 Webview 边界。
4. Agent 会面对不清晰的能力入口：它是在改 Canvas 顺序、改 Cut timeline，还是改自己的临时顺序。

因此需要明确“Canvas 的时间线形态”只是预览路线，不是 Cut 剪辑时间线。

## 相关边界

本 ADR 与以下系统和领域边界保持一致：

- Canvas 的节点、容器、连接、route 和 preview session 归 `interactive` 领域；播放路线是 Canvas 子系统，不是新的 Canvas kind。
- 分支叙事和互动 route 在 Canvas 内统一投影为 `CanvasPlaybackPlan.routeCandidates`；实现不得为 narrative 分支另建独立播放路线模型。
- 素材、缩略图、媒体引用和生成产物必须通过 Asset / ResourceRef / ContentAccess 路径进入 `CanvasCutDraftPayload`，不得把任意 host 绝对路径写成长期事实。
- Cut 导出仍走视频领域导出与交付管线；本 ADR 只规定 Canvas 到 Cut 的剪辑初稿交接，不改变导出权威。

## 决策

OpenNeko 采用以下边界：

```text
Canvas 管故事顺序和预览路线
Cut 管视频剪辑时间线
Agent 通过共享协议读取、展示、确认和触发高层操作
```

Canvas 不实现 Cut 式剪辑 timeline。Canvas 可提供 `Playback Route Navigator`，其主形态是预览路线矩阵（Route Storyboard Matrix），紧凑形态可以退化为 `PlaybackRouteStrip`。它只用于展示、筛选、选择、切换和预览 `CanvasPlaybackPlan`。Cut 继续拥有 `.nkv` 的剪辑 timeline 权威。Agent 可以感知顺序，但不拥有自己的 timeline 模型。

## 顺序权威

Canvas 的播放顺序权威来自 `.nkc` 中的 Canvas 模型：

```text
.nkc CanvasData
  容器 child 顺序
  nodeOverrides.order
  edgeOverrides.order / priority
  节点坐标 fallback
        │
        ▼
CanvasPlaybackPlan
        │
        ├─ Canvas 预览播放
        ├─ Canvas 预览路线导航器 / 路线矩阵
        ├─ Agent 顺序摘要和确认
        └─ Canvas -> Cut 剪辑初稿快照
```

时间线形态或矩阵形态的 Canvas UI 不得保存第二套 `timelineOrder`、`routeOrder` 或矩阵私有顺序。若未来允许在 Canvas 预览路线导航器里重排，必须调用 Canvas command 更新容器、节点或连线顺序，再重新生成 `CanvasPlaybackPlan`。路线导航器自身只保存视图模式、筛选条件、折叠状态、当前 route、hover、选择、playhead 等运行态 UI 状态。

### 生成与缓存策略

`CanvasPlaybackPlan` 是派生投影，不是持久项目事实。实现应按需生成，并可用 dirty flag 或 revision/hash 做短期缓存：

- 预览打开、预览刷新、Agent 查询、发送 Cut 前创建 draft 时，基于当前 `CanvasData` 快照生成 plan。
- Canvas 数据、playback metadata、选中节点、adapter/mode 或资源投影变化后，相关缓存必须失效。
- 如果 plan 或 preview-enriched plan 包含已解析的媒体 metadata（duration、thumbnail、poster frame、availability、probe result 等），外部素材、ResourceRef resolver、Asset index 或 ContentAccess revision 变化也必须使缓存失效。若 plan 只保存 durable resource reference，则这些媒体解析结果应留在 preview enrichment 层，不进入基础 `CanvasPlaybackPlan` 缓存键。
- 跨 Webview、Agent 或 Cut draft 传递时，应带上 source canvas uri、route id 和 canvas revision/hash；消费者必须能发现 stale plan，而不是继续把旧 route 当成当前事实。
- 缓存只能优化投影成本，不能成为顺序权威；命中缓存与重新生成应得到等价的 units、transitions 和 route candidates。

### Route 选择持久化

应区分 durable playback intent 和 runtime route session：

- `.nkc` 的 `playback.entryIds`、`nodeOverrides`、`edgeOverrides` 表达持久播放入口、排序和分支优先级。
- 当前 route id、current unit、playhead、hover、折叠状态默认属于 `PlaybackSession` 运行态，关闭预览后可以丢弃。
- 如果产品需要记住“默认播放路线”，应写入 Canvas playback metadata 中的明确字段或通过 entry/edge order 表达；不得把路线条私有 UI 状态当作持久排序。
- 多分支导入 Cut 前必须明确选择一条 route；自动入口或自动 route 可以作为默认建议，但导入确认中应显示其来源和潜在歧义。

## Canvas 职责

Canvas 可以提供轻量播放路线能力：

- 展示 `CanvasPlaybackPlan` 的 scene / shot / media 单元。
- 当前段高亮、点击跳转、上一段、下一段、播放/暂停。
- 显示总时长、单段时长、分支点、缺失素材和 diagnostics。
- 选择 route，并把选定 route 发送到 Cut。
- 在编辑态中高亮当前播放节点，但播放高亮不得等同于选择状态。

Canvas 不负责：

- clip 入点/出点裁剪。
- 多轨叠加。
- 转场、效果、字幕、音频轨编辑。
- 导出参数。
- `.nkv` timeline 结构维护。
- Cut Webview 内部 store 或 timeline 组件复用。

## 播放路线与生成/依赖图分离

Canvas 并不是所有结构都需要或适合投影成 route。必须区分：

```text
Playback Route
  顺序播放、叙事推进、分支选择、容器内连续播放

Workflow / Derivation Graph
  多输入生成、素材依赖、prompt/reference 输入、生成 provenance

Association / Reference Graph
  注释、引用、素材绑定、关系说明
```

例如：

```text
节点 A + 节点 B + 节点 C -> 节点 D（生成视频）
```

这表示 A/B/C 是 D 的输入或依赖，不表示 A、B、C、D 应按顺序播放。该结构默认不应生成一条 route，也不应在 Route Storyboard Matrix 中展开为一行连续播放 cell。

`CanvasPlaybackPlan` 只覆盖可播放顺序结构：

- 明确的播放/叙事连接。
- 容器内声明的连续播放节点。
- route entry、branch、choice 和 transition。
- 可播放 media / shot / story beat / sequence / container。

不应默认覆盖：

- prompt、reference、note、asset link 等辅助节点。
- 多输入生成节点的依赖边。
- workflow 中间节点。
- 只用于生成结果的输入素材或草稿节点。

如果生成结果 D 是可播放视频，D 可以成为 route cell；A/B/C 应作为 D 的 provenance、source input 或 detail panel metadata 展示：

```text
Route Matrix: [Video D]
Cell detail: inputs = A, B, C
Provenance view: A + B + C -> D
```

如果用户希望 A/B/C/D 都参与播放，必须显式建立播放 route，例如建立 `A -> B -> C -> D` 的播放连接，或把它们放入有播放顺序的容器。Route Storyboard Matrix 只展示播放路线 projection；生成链路应由 workflow / derivation projection 或节点详情展示。

## Route Storyboard Matrix

Canvas 底部预览路线的默认信息架构应是 `Route Storyboard Matrix`，而不是 Cut 式轨道时间线或普通表格。矩阵用于表达多 route、多分支和容器内连续播放节点：

```text
列 = 播放步骤 / Step
行 = route family 中的 divergent route / branch
cell = 一个可播放 unit（shot、media、story beat、可播放容器等）
容器 = 列分组 header / bracket / 可折叠 section
```

示意：

```text
┌──────────────┬──────────── Scene A / Container ────────────┬──── Scene B ────┐
│ Route / Step │ Step 01        Step 02        Step 03       │ Step 04        │
├──────────────┼──────────────┬──────────────┬──────────────┼───────────────┤
│ Main Route   │ [Shot A1]     │ [Shot A2]     │ [Shot A3]     │ [Shot B1]      │
│ Branch A     │ [Shot A1]     │ [Shot AX]     │ [Shot A3]     │ [Shot B1]      │
│ Branch B     │ [Shot A1]     │   empty       │ [Shot BY]     │ [Shot B1]      │
└──────────────┴──────────────┴──────────────┴──────────────┴───────────────┘
```

每个 cell 应优先展示缩略图或 poster frame，并显示最小必要 metadata：

```text
thumbnail
unit label / shot number
time range 或 duration
media/status/diagnostic badge
```

时间段需要展示，但只是矩阵的辅助信息，不把 Canvas 预览变成 Cut timeline：

- cell 可显示 `0:04-0:06 · 2s`。
- route 行头可显示总时长，如 `Main Route · 0:18`。
- step 列头可显示累计时间，如 `Step 03 · 0:06`。
- container header 可显示容器时间范围，如 `Scene A · 0:00-0:08`。

### 行来源与 Route Candidate 分组

`CanvasPlaybackPlan.routeCandidates` 可能包含 `entry`、`auto-entry`、`selection`、`scene`、`container`、`component`、`single-unit` 等不同来源，其中很多只是同一 Canvas 图的子集投影。Route Storyboard Matrix 不应把所有 candidate 无差别铺成行，否则会产生大量高度重叠的行和重复 unit。

矩阵行应先按 route family 分组：

- 默认 family 是当前用户选择的 entry、container、scene 或 selection scope。
- family 内只展开真正发生分歧的 route / branch。
- `single-unit`、`selection`、`scene`、`container` 等局部 candidate 默认作为 scope/filter/quick focus，不自动成为与主 route 并列的永久行。
- `auto-entry` 可以作为默认建议行，但必须标记来源；若与显式 entry 重叠，应折叠到同一 family。
- UI 可以提供“Show all candidates”调试/高级模式，但默认视图应按 family 折叠并去重。

同一行必须来自同一个 `CanvasPlaybackPlan`、同一个 adapter 投影和同一个 route family；Matrix 不混排不同 adapter 产生的行。

### 列对齐

矩阵列对齐必须可预测，不能依赖全局 LCS 或复杂 diff。推荐规则：

- 以容器边界作为强制对齐点。
- 同一 Matrix 视图内所有行共享同一个 adapter 投影；container 角色在所有行中必须一致，不能同一容器在某行是 header、另一行是普通 cell。
- 容器内按该 route 的 unit 顺序线性展开。
- 不做跨容器全局 LCS 对齐；跨容器的 unit 即使 label 或 source 相似，也不互相对齐。
- 同一容器内可按稳定 unit identity 对齐公共前缀、公共后缀和明确 branch junction；这里的稳定 identity 指 `sourceNodeId`、container child id、source scene/shot id 或等价 Canvas 域标识符，不是 plan 生成时可能变化的 `CanvasPlaybackUnit.id`；没有稳定 identity 时按顺序放置，并用空白 cell 补齐其他行。
- 矩阵列是 view model 的 alignment slot，不是 Canvas 领域实体，也不是持久事实。

空白 cell 的判定必须基于上述 alignment slot：某行在该容器内、该 slot 没有对应 playable unit 时，才显示空白 cell。

### 空白 Cell

矩阵需要支持空白 cell。空白 cell 用于对齐多 route / branch，并表达：

- 该 route 在该 step 没有对应播放 unit。
- branch 提前结束、稍后接入或跳过某个容器内节点。
- 该位置可作为显式插入目标。

空白 cell 不是 Canvas 数据，不写入 `.nkc`，也不参与 `CanvasPlaybackPlan` 的顺序权威。它只是矩阵投影层为了视觉对齐生成的 view model。

### 多节点与容器

矩阵必须按播放投影角色展示多种节点和容器，而不是把 Canvas 上所有节点原样塞进 cell：

| 类型 | 矩阵呈现 |
| ---- | -------- |
| 可播放节点 | 普通 cell，显示缩略图、label、时长和状态 |
| 可播放容器 | 特殊 container cell，显示封面、子节点数量、总时长和容器标识 |
| 非播放容器 | 列分组 header / bracket / 可折叠 section，不占普通 shot cell |
| 容器内连续播放节点 | 在容器 header 下展开为连续 cell |
| 分支/选择节点 | branch junction / switch cell，不伪装成 shot 缩略图 |
| reference / note / prompt / asset link 等辅助节点 | 默认隐藏，或以 badge / issue / filter 结果展示 |

折叠容器时，可以把连续节点压缩为 summary cell，例如：

```text
Scene A · 3 shots · 0:08
```

容器折叠必须是全局视图状态：同一容器在所有 route 行中同时折叠或展开，不能按行独立折叠。按行独立折叠会破坏列对齐。

折叠后 summary cell 应使用等价于该容器展开列数的 colspan 保持对齐；如果实现框架不支持真实 table colspan，也必须在 view model 中保留占位 slot，使后续容器和 step 位置保持一致。

点击 summary cell 选中容器；展开后才显示内部可播放节点。若容器内有分支，容器 header 保持不变，分支差异在不同行的 cell 中表达。

### 切换连线

矩阵可以展示连线，但只展示影响播放顺序和分支切换的连接，不复刻完整 Canvas 连线图：

- 默认通过行和列表达顺序，不常驻显示所有相邻连接。
- 分支点应以 switch / junction cell 或轻量连接标记显示可切换路径。
- hover 或选中 cell / route 行时，可以高亮该 route 的前后连接、来源容器和目标节点。
- 点击切换连线只改变当前预览 route / branch selection；不得直接修改 Canvas 连线，除非进入显式编辑动作。

### 筛选、选择和切换

矩阵应支持快速筛选、选择和切换：

- 按 scene/container、route/branch family 做行或范围筛选。
- 按 node kind、media availability、diagnostic、生成状态做高亮、badge、issue view 或聚焦结果；默认不隐藏单个列 slot，以免破坏行间对齐。
- 点击 cell：选中对应 Canvas 节点或容器，Canvas 视口定位，PreviewStage 跳转到该 unit。
- 点击行头：切换当前 route / branch。
- 点击列头：高亮同一步的分支差异。
- hover cell：高亮 Canvas 中对应节点、容器边界和 route path。

这些交互只改变 `PlaybackSession` 或 Canvas selection，不改变 Canvas 顺序事实。

### 编辑边界

矩阵默认处于 `Preview Mode`，只做导航、筛选、选择、切换和 seek。编辑必须进入显式 `Route Edit Mode`，并且所有写操作都必须落回 Canvas 的容器、节点、连线模型：

| 操作 | 是否允许 | 约束 |
| ---- | -------- | ---- |
| 调整 route 顺序 | 可允许 | 调用 Canvas reorder capability，更新容器 child 顺序、node/edge order 或连接优先级 |
| 插入到空白 cell | 可允许 | 插入锚点必须解析为“同一容器内、当前 route 行中前一 playable unit 之后、后一 playable unit 之前”；创建或连接 Canvas 节点并进入 undo 栈；不得把 `[row, col]` 当作持久锚点 |
| 删除 cell | 高风险 | 必须明确是“从容器移除”“断开 route”还是“删除节点”，不得静默删除 Canvas 数据 |
| 清空整行 | 高风险 | 等价删除/断开 branch route，需要确认和 undo |
| 清空整列 | 不允许 | 列是对齐结果，不是领域实体；批量操作应按容器、route family、step range、selection set 等领域维度表达 |
| 删除容器 | 高风险 | 必须走 Canvas 容器删除逻辑和确认门控 |

Agent 发起上述写操作时，必须经过对应 capability 的风险门控；没有明确用户指令时不得自动修改 route、清空行列或删除 cell。

## Cut 职责

Cut 继续拥有真正的视频剪辑 timeline：

- `.nkv` 项目权威。
- tracks / clips。
- trim、speed、transition、effects、subtitle、audio、keyframes。
- preview render、export 和质量诊断。
- basic mode / 快剪，以及 professional mode / 精修剪辑。

Canvas 发送给 Cut 的内容是一次有序剪辑初稿快照。导入之后，`.nkv` 内部顺序和剪辑状态由 Cut 管理。Cut 不应默认反向改写 Canvas 顺序。

仓库可以同时存在并打开多个 `.nkv`，它们是独立项目，不共享“当前 Cut”持久状态。任何导入或 timeline mutation 必须在跨越 authoring 边界前携带显式 `.nkv` document URI 与 expected revision，或显式创建新项目。活动/最近编辑器、文件名相似度、普通 generated-output 完成和 Workspace Board projection 都不得隐式选择目标；交互命令只有在 adapter 固化其 owning editor identity/revision 后才能调用同一 authoring path。

## 预览 UI 形态

Canvas 编辑与预览必须合并在同一个 Canvas Editor Webview 中，不再维护独立 Canvas Preview Webview。预览能力作为 Canvas Editor Webview 内的 `PlaybackWorkspace` 子工作区存在，并分为可组合组件：

```text
PlaybackWorkspace
  ├─ CanvasViewportPane   画布区，可隐藏
  ├─ PlaybackStage        预览播放区，可隐藏
  ├─ PlaybackRouteNavigator
  │   ├─ RouteStoryboardMatrix   预览路线矩阵，默认形态，可隐藏
  │   └─ PlaybackRouteStrip      紧凑路线条，可选形态
  └─ PlaybackSession      route/currentUnit/playhead/isPlaying
```

Canvas Editor Webview 采用以下布局：

```text
Canvas Editor Webview
┌────────────────────────────────────┐
│ 上方：画布区 可隐藏 + 预览播放区 可隐藏 │
├────────────────────────────────────┤
│ 下方：Canvas 预览路线导航器 可隐藏      │
└────────────────────────────────────┘
```

Canvas 可以提供一个“预览/播放工作区”入口，用于显示或聚焦同一 Webview 内的 `PlaybackWorkspace`，不得打开第二个 Canvas Preview Webview。画布区、播放区和路线导航器必须支持独立显隐；这些显隐可以由工作区 header、左侧工具栏或快捷键触发，但它们都只能切换同一个 `PlaybackWorkspace` 内的 pane state，不能创建多个互相竞争的预览 Webview。

该合并不改变职责边界：Canvas Editor Webview 可以同时承载编辑画布、播放界面和预览路线条，但播放路线仍来自 `CanvasPlaybackPlan`，路线条仍不得保存私有排序，媒体资源授权仍由 Extension Host / `neko-preview` / Engine 按 intent 提供。

## 共享协议

需要统一协议，但不统一为一个大 timeline 协议。稳定契约分为三层：

```text
CanvasPlaybackPlan
  Canvas 内部/共享播放投影

CanvasCutDraftPayload
  Canvas -> Cut 的剪辑初稿快照

CanvasTimelineSyncPayload
  Cut -> Canvas 的轻量回流
```

### CanvasPlaybackPlan

`CanvasPlaybackPlan` 是 Canvas 顺序的规范投影。Canvas 预览、内嵌路线条、Agent 顺序摘要和导入 Cut 的输入都应从它派生。它可以包含 Canvas 的 adapter、behavior mode、units、transitions、route candidates 和 diagnostics。

Cut 不应直接把完整 `CanvasPlaybackPlan` 当作 timeline 编辑模型。Cut 只消费经过投影后的剪辑初稿 payload。

### CanvasCutDraftPayload

`CanvasCutDraftPayload` 是 Canvas 发送给 Cut 的窄协议，用于生成 `.nkv` 初稿。payload 描述内容快照，不拥有目标选择；调用 authoring capability 时还必须提供显式 existing/new Cut target。它应包含：

- source canvas uri / revision。
- route id。
- project name。
- ordered units。
- sourceNodeId / sourceSceneId / sourceShotId。
- duration。
- label / description。
- media resourceRef / assetPath / thumbnail。
- dialogue / voiceOver / soundCue / text cues。
- source mapping metadata。

该 payload 表示一次快照，不表示 Canvas 与 Cut 之间的持续双向同步。

cue 字段的来源应是 Canvas 当前已接受的节点 metadata、关联 Story 文档投影或 Agent 产物投影。Draft 只保存“导入 Cut 所需的快照值”和 source mapping；它不反向成为 Story 剧本文本、Canvas 节点内容或 Cut 字幕轨的长期权威。若不同来源出现冲突，生成 draft 的投影层必须 fail-visible 或产生 diagnostic，不能静默挑一个默认值。

协议可以保留受命名空间约束的 extension bag，例如 `extensions["neko.<package>"]`，用于携带低风险、可忽略的附加 metadata。extension key 必须匹配 Neko package namespace（如 `neko.canvas`、`neko.cut`、`neko.preview` 或 `neko.<packageName>`），裸 key、第三方未声明前缀和重复抢占他包 namespace 应 fail-visible。extension bag 不能承载排序、轨道、clip、效果、导出设置、文件路径授权或审批状态；这些必须进入明确字段或对应领域协议。

### CanvasTimelineSyncPayload

`CanvasTimelineSyncPayload` 是 Cut 回流给 Canvas 的最小状态。允许回流：

- `.nkv` 路径或 projectName。
- importedAt。
- duration。
- thumbnail。
- selectedInTimeline。
- source shot/node mapping。

不得通过该协议回流 Cut 的完整 timeline、clip 结构、效果参数或导出状态，也不得让 Cut 成为 Canvas 顺序权威。

## Agent 集成

Agent 需要感知并可展示 Canvas 顺序，但不拥有自己的 timeline、活动 Cut target，也不实现独立视频播放器。Agent 的分工是理解、展示、诊断、确认和调用 owning capability；Canvas Editor Webview 内的 `PlaybackWorkspace`、Cut 和 `neko-preview` / Engine 负责实际播放与媒体运行时。

Agent 可以：

- 读取当前 `CanvasPlaybackPlan`。
- 展示 route 摘要、有序清单、导入 Cut 前确认和轻量预览卡片。
- 诊断缺失素材、入口不明确、分支歧义和时长异常。
- 在用户确认并明确 existing/new `.nkv` target 后调用 Canvas/Cut capability 发送选定 route 到 Cut。
- 通过高层 command 请求 Canvas 调整顺序。
- 显示或聚焦 Canvas Editor Webview 内的 `PlaybackWorkspace`、Cut Preview / Timeline 或资源预览，并传递 route、unit、sequence 或 clip 的定位意图。
- 通过 Engine、Preview、Media LSP 或领域工具读取 probe、关键帧、缩略图、字幕、音频峰值、质量诊断等可分析数据。

Agent 不得：

- 维护 `agentOrder` 作为独立事实源。
- 维护独立 playhead、route timeline、播放器状态或视频流生命周期。
- 在 Agent Chat 内复制 Canvas `PlaybackWorkspace` / Cut Preview 的完整播放器。
- 直接操作 Canvas 或 Cut Webview store。
- 直接修改 `.nkv` 私有结构。
- 从活动/最近编辑器或生成结果隐式推断 `.nkv` target。
- 绕过确认执行中高风险剪辑或导入操作。

### Agent 交互形态

Agent 展示的顺序是解释和确认层，不是播放层。推荐交互形态：

```text
Agent message card
  当前路线：Shot 1 · 20 units · 约 1:00
  诊断：2 个镜头缺预览图，入口为自动推断
  操作：
    [在 Canvas 中播放]
    [发送到 Cut]
    [查看完整顺序]
```

Agent 可展示的轻量预览内容包括缩略图、poster frame、当前 shot 图片、时长、素材状态、diagnostic 和 source mapping。它不得承载解码、seek、流控、frame clock、音频同步或 Canvas/Cut 的播放会话状态。

播放交互应通过 reveal/open intent 转交给 owning surface：

```text
Agent
  -> revealCanvasPlaybackWorkspace(sourceCanvasUri, routeId, unitId?)
      -> Canvas Editor Webview shows PlaybackWorkspace and owns playback session

Agent
  -> revealCutTimeline(projectUri, sequenceId?, clipId?)
      -> Cut owns timeline and playback session

Agent
  -> revealResourcePreview(resourceRef, intent)
      -> neko-preview / Engine owns media playback
```

这些 intent 是宿主动作，不是文件系统授权本身；Extension Host 仍负责资源授权、Webview 生命周期和 stale session 诊断。

推荐能力入口：

```text
canvas.getPlaybackPlan
canvas.getPlaybackRoutes
canvas.revealPlaybackWorkspace
canvas.createCutDraftFromRoute
canvas.reorderPlaybackUnits
cut.importCanvasDraft
cut.revealTimeline
cut.getTimelineInfo
```

读操作应标记为 read-only。导入、重排、生成 `.nkv` 或覆盖已有 Cut 项目属于确认门控操作。

Agent 相关门控由 capability policy、permission mode、approval gate 和用户确认 UI 共同决定。Feedback/arbiter 可以提供诊断、修复建议和是否需要用户确认的信号，但不能替代权限判断。

推荐粒度：

| capability | 风险 | 门控 |
| ---------- | ---- | ---- |
| `canvas.getPlaybackPlan` / `canvas.getPlaybackRoutes` | 低 | read-only，无需确认 |
| `canvas.revealPlaybackWorkspace` | 低 | 显示/聚焦同一 Canvas Editor Webview 内的预览工作区可无需确认；若触发资源授权或长任务，按宿主 policy 处理 |
| `canvas.createCutDraftFromRoute` | 中 | 创建临时 draft 可 read-only；若写文件、创建项目或发送 Cut，则需要确认 |
| `canvas.reorderPlaybackUnits` | 中 | 修改 `.nkc` 顺序，需要确认；若同一 Agent turn 中存在明确、具体的用户重排指令，可以按 capability policy 降为 auto-approve |
| `cut.importCanvasDraft` | 中/高 | 创建或更新 `.nkv`，必须确认；覆盖已有项目或批量生成时提高风险 |
| `cut.revealTimeline` | 低 | 打开/聚焦 Cut 项目或定位 clip 可无需确认；不得隐式修改 timeline |
| `cut.getTimelineInfo` | 低 | read-only，无需确认 |

“明确、具体的用户重排指令”必须包含可解析目标和顺序意图，例如“把 scene 3 移到 scene 1 前面”。Agent 自主推断、笼统优化请求、批量重排或会覆盖既有用户排序的操作仍需确认。

## 文件关系

`.nkc` 与 `.nkv` 保持分离：

```text
.nkc
  Canvas 语义、节点、容器、连线、播放入口、顺序 metadata

.nkv
  Cut 剪辑项目、轨道、clip、效果、导出设置
```

两者通过 `linkedProject`、source mapping 或轻量 sync metadata 关联。不得合并文件格式，也不得让任一文件隐式承担另一方的完整事实。

## Extension Host 边界

Extension Host 负责协调命令、文件创建、资源授权和低频状态同步：

```text
Canvas Webview
   │ typed message / command
   ▼
Extension Host
   ├─ 生成/读取 CanvasPlaybackPlan
   ├─ 显示/聚焦 Canvas Editor Webview 内的 PlaybackWorkspace
   ├─ 创建 CanvasCutDraftPayload
   ├─ 调用 Cut 导入命令
   └─ 投递 CanvasTimelineSyncPayload

Cut Webview
   └─ 管理 .nkv 和剪辑 timeline
```

Extension Host 不应代理高频 timeline UI 操作、playhead 拖拽或 Cut Webview 内部编辑事件。

## PlaybackStage 与 Viewport 边界

`PlaybackStage` 是 Canvas 预览播放区。它可以使用 `ViewportShell` / ViewportProtocol，但不是所有预览都必须进入统一 Viewport 控制协议。

适用规则：

- 当 stage 承载 Engine/Scene/Live/Video 等需要 command envelope、frame metadata、overlay 或 ack/resync 的可控视口时，应通过 ViewportProtocol 或 owning runtime controller 接入。
- 当 stage 只是显示静态图、文档缩略图、shot card 或普通 media element 时，可以使用普通预览 renderer，不需要制造 viewport command。
- `PlaybackSession` 只管理 route、current unit、playhead 和播放状态；ViewportProtocol 管 scene/control 命令、seq、correlationId、revision 和 frame metadata。两者通过当前 unit 的 source mapping 关联，不共享状态机。
- playhead、route 切换和 segment click 不应被包装成 ViewportProtocol command，除非它们确实控制了一个 Engine/Scene viewport。

## 共享 UI 原语

Canvas 预览路线条和 Cut timeline 不能直接复用领域组件。但可在满足以下条件后抽取中立 UI primitive：

- primitive 不依赖 Canvas/Cut 文件格式。
- primitive 不包含 clip、track、node、shot 等领域语义。
- primitive 只表达 segment strip、ruler、transport controls、route selector、diagnostic marker 等低语义视觉与交互。

适合进入共享层的候选：

- `PlaybackTransportControls`
- `RouteStoryboardMatrix`
- `PlaybackRouteStrip`
- `SegmentedPlaybackTimeline`
- `TimelineRuler`
- `PlaybackClock`

Canvas 和 Cut 分别通过 adapter 投影自己的领域模型，不让共享 UI 理解 `.nkc` 或 `.nkv`。

## 后果

正面后果：

- Canvas 顺序、预览、Agent 和 Cut 导入使用同一顺序来源。
- Cut 的剪辑 timeline 职责保持清晰。
- Agent 能以可审计、高层能力操作，而不是操纵 Webview 内部状态。
- Canvas 编辑、播放和预览路线共用同一 Webview 生命周期，编辑与预览互操作更直接。

成本：

- 需要新增或收敛 `CanvasCutDraftPayload` 投影层。
- Canvas 预览组件需要收敛到 Canvas Editor Webview，并拆出 `PlaybackStage`、`PlaybackRouteNavigator` / `RouteStoryboardMatrix` 和 `PlaybackSession`。
- Agent capability 需要显式区分 read-only 查询和 confirmation-gated 导入/重排。
- 同一 Webview 内需要更严格处理编辑快捷键、播放快捷键、焦点、资源释放和媒体授权生命周期。

## 验证要求

涉及该边界的实现应覆盖：

- `CanvasPlaybackPlan` 由 Canvas 顺序生成，路线条不保存私有排序。
- Plan 生成缓存必须由 Canvas revision/hash 失效；stale plan 不能继续成功导入 Cut。
- 若 plan enrichment 包含媒体解析结果，外部素材、Asset index、ResourceRef 或 ContentAccess revision 变化必须使相关缓存失效。
- 持久 route intent 与 `PlaybackSession` 运行态分离；关闭和重开预览不会写入私有 timeline 顺序。
- 多输入生成、reference、prompt、note、asset dependency 等非播放连接不得默认进入 `CanvasPlaybackPlan` route；只有明确播放边、播放容器顺序或 route metadata 才能生成播放 unit / transition。
- Route Storyboard Matrix 行必须按 route family 分组和去重；默认只展开 divergent routes / branches，不能把所有 route candidate 无差别铺成重复行。
- Matrix 列对齐必须以容器边界为强制对齐点，容器内线性展开，不做跨容器全局 LCS；空白 cell 必须由稳定 alignment slot 派生。
- Route Storyboard Matrix 的空白 cell、列对齐、筛选条件和折叠状态只存在于 view model / session，不写入 `.nkc` 顺序事实。
- 同一 Matrix 视图内所有行必须共享同一 adapter 投影，container 角色在所有行中一致。
- 矩阵 cell 点击必须同步 Canvas selection、Canvas viewport focus 和 PreviewStage current unit；该流程不得修改 Canvas 顺序。
- 容器折叠必须是全局视图状态；折叠 summary 必须保持等价 colspan / slot 占位，不能破坏列对齐。
- Route Edit Mode 的重排、插入、删除、清空行列必须调用 Canvas command/capability，并进入 undo/确认门控；Preview Mode 不得执行写操作。
- 插入空白 cell 的写操作必须锚定到 Canvas 语义位置（同一容器、前驱/后继 playable unit），不能锚定到易变的 `[row, col]`。
- 列级筛选不得默认隐藏单个 alignment slot；按 unit 属性的筛选应优先表现为高亮、issue view 或 selection set。整列清空不允许，批量操作必须使用容器、route family、step range 或显式 selection set。
- 容器内连续播放节点必须从同一 `CanvasPlaybackPlan` 投影展开；折叠容器只产生 summary view，不新增持久播放 unit。
- 切换连线只展示与当前 route / branch 相关的播放连接；hover/选中高亮不得复刻全量 Canvas 连线，也不得直接修改 Canvas edges。
- 预览播放、Agent 摘要和 Cut 导入使用同一 route。
- Canvas -> Cut 导入能保留 source node / scene / shot mapping。
- Cut -> Canvas 回流只更新允许的轻量 metadata。
- Draft cue 字段必须带 source mapping 或 diagnostic，不能静默覆盖 Story、Canvas 或 Cut 的权威事实。
- Draft extension bag 必须校验 Neko package namespace，非法 key 应 fail-visible。
- PlaybackStage 只有在承载可控 viewport runtime 时才走 ViewportProtocol；播放路线交互不冒充 viewport command。
- Canvas Editor Webview 内编辑模式和播放模式的快捷键不得冲突；焦点切换到 `PlaybackWorkspace` 时编辑快捷键应 passthrough 或 suppress，反向切回画布编辑时播放快捷键也应解除占用；`PlaybackWorkspace` 隐藏、Webview 失焦或 session stale 后，媒体资源应及时释放、暂停或降级。
- Webview 运行态验证应使用 Extension Development Host / `vscode-extension-debugger`，不能只用普通浏览器替代。
- Agent 导入或重排能力应有确认门控测试，读操作应保持 read-only。
