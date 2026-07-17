# ADR: 创作领域面板与共享 UI 原语边界

状态：Accepted
日期：2026-06-20
更新日期：2026-07-17（同步保留领域）
范围：React Webview、`@neko/ui`、保留领域包的属性面板、工具面板、TreeView、Inspector、Timeline/Canvas/Agent 等编辑面板。

本文记录 OpenNeko 对创作领域 UI 复用边界的决策。它补充 `ui-theme-i18n-error-logging.md`、`package-boundaries.md` 和 `adr-code-review-quality-gates.md`，用于避免“复用组件”演变成跨领域功能模型和重复 adapter。

## 背景

OpenNeko 的保留 Webview 包覆盖 Canvas、Cut、Preview、Agent、Assets 和 Tools 等领域。它们表面上都包含面板、分组、滑杆、颜色、选择器、树、列表和工具栏，但这些控件承载的领域语义不同：

- Canvas 面板表达节点、连接、创建策略和叙事结构。
- Cut 面板表达时间线元素、keyframe、默认样式、预览提交和媒体属性。
- Agent 面板表达 session、模型/provider 选择和消息投影。
- Assets 面板表达素材、Entity、metadata 和 Inspector 交互。

如果把这些面板统一为一个通用 `PropertyDefinition` / `TreeViewItem` 功能模型，领域包需要额外编写：

1. 领域对象到通用 UI schema 的映射。
2. 通用 `(id, value)` 事件到领域 patch/command 的反向解析。
3. 每个包自己的类型守卫、默认值、clamp、keyframe 状态和 no-op 分支。
4. adapter 专属测试。

这会让“复用”增加代码量，并把原本直接表达领域交互的 UI 路径拉长。共享层变成了通用业务解释器，而不是样式、控件和交互约束的基础设施。

典型反模式是固定面板先擦除类型、再恢复类型：

```text
TimelineElement.animTransform.x: AnimatableProperty
  -> map to PropertyDefinition { id: "animTransform.x", kind: "number", value: number }
  -> PropertyPanel commits (id: string, value: PropertyValue)
  -> propertyPath.split(".") + typeof value
  -> rebuild Partial<TimelineElement>
```

这个路径把编译期可见的领域类型降为 `string | number | boolean`，再依赖 `id` 字符串和运行时类型守卫恢复。对固定字段来说，这不是必要抽象，而是把开发错误推迟到运行时。

## 决策

OpenNeko 的创作 UI 复用边界采用以下原则：

> 共享视觉和交互约束，领域面板保留领域结构；只有数据本身是动态、未知或插件化时，才使用通用属性模型。

`@neko/ui` 应优先提供无业务 React 原语、组合控件和一致的交互规则。领域包应直接表达自己的功能结构、状态生命周期和命令语义。跨领域复用不得强迫固定功能面板通过通用 schema/adapter 往返转换。

这不等于取消 `PropertyPanel`。决策目标是补上第三条路径：

| 路径 | 适用 | 问题/价值 |
| ---- | ---- | --------- |
| 通用 schema + adapter | 动态字段、插件字段、runtime 参数 | 对固定面板会类型擦除并增加反向解析 |
| 裸 JSX | 极少量一次性 UI | 代码重复，布局和交互容易漂移 |
| 类型化组合原语 | 固定领域面板 | 保留编译期类型，同时复用布局、控件和约束 |

## 可共享内容

以下能力适合进入 `@neko/ui` 或共享 Webview 基础层：

| 类型 | 示例 |
| ---- | ---- |
| 视觉原语 | Button、IconButton、Badge、Dialog、Tabs、Toolbar、Tooltip、Panel shell、Section、EmptyState |
| 表单控件 | NumberInput、Slider、ColorPicker、Select、Switch、Checkbox、Stepper、SegmentedControl |
| 创作控件约束 | 统一 spacing、density、disabled、focus ring、keyboard suppression、tooltip、a11y、drag affordance |
| 主题与布局约束 | VS Code token、`--neko-*` token、radius、border、scroll container、panel resize rule |
| 稳定低语义组合 | 属性行、分组、轴向输入、数值/颜色/选择属性行、TreeView visual shell、keyframe visual shell |
| 测试工具 | Webview UI test utils、keyboard/focus helpers、render wrappers |

这些共享能力只接收 props、callbacks 和 typed data，不拥有领域状态、文件格式、Engine command、Agent runtime 或 Extension message 协议。

### 当前共享原语覆盖

截至 2026-06-20，`@neko/ui` 已覆盖多数基础控件，并已补齐固定面板迁移所需的低语义组合原语。固定领域面板出现 adapter 膨胀时，不能先假设“共享组件缺失”，应先审计已有原语是否被绕过。

| ADR 要求 | 当前状态 | 位置 |
| -------- | -------- | ---- |
| `NumberInput` | 已存在 | `@neko/ui/creative` |
| `ColorPicker` | 已存在 | `@neko/ui/creative` |
| `Badge` | 已存在 | `@neko/ui/primitives` |
| `Dialog` | 已存在 | `@neko/ui/primitives` |
| `EmptyState` | 已存在 | `@neko/ui/primitives` |
| `SegmentedControl` | 已存在 | `@neko/ui/primitives` |
| `Checkbox` | 已存在 | `@neko/ui/primitives` |
| `Switch` | 已存在 | `@neko/ui/primitives` |
| `Stepper` | 已存在 | `@neko/ui/primitives` |
| `PropertyRow`（layout-only） | 已存在 | `@neko/ui/creative`；schema-bound row 已改名为 `SchemaPropertyRow` |
| `PanelSection` | 已存在 | `@neko/ui/creative` |
| `AxisGroup` | 已存在 | `@neko/ui/creative`；用于 2/3/4 轴数字组 |
| `NumberPropertyRow` / `SliderPropertyRow` / `ColorPropertyRow` / `SelectPropertyRow` | 已存在 | `@neko/ui/creative` |
| `KeyframeButton` / `KeyframeDiamond` / `KeyframeTimeline` visual shell | 已完成语义剥离 | `@neko/ui/creative`；视觉 DTO 留在 UI 层，轨道生命周期语义由领域包投影 |

因此，后续审查重点不是再抽一个通用 property interpreter，而是：

1. 已有基础控件没有被所有领域优先复用。
2. 固定面板是否直接使用 layout-only row / section / axis / typed property row，而不是先生成临时 `PropertyDefinition[]`。
3. 动态 schema 是否是真实 runtime/provider/registry contract，而不是为了复用布局制造的中转层。

`neko-cut` 是当前最典型的迁移样本：固定 Basic / Transform / Text / Subtitle / Audio 行已迁到 typed composition rows，原 `sharedPropertyAdapter` 已删除。`PropertyPanel/inputs/NumberInput.tsx`、`ColorInput.tsx` 和 `CheckboxInput.tsx` 只应作为过渡薄封装存在，不能再重新引入 package-local HTML 控件或 schema adapter。

### 组合原语分层

创作属性 UI 应分为三层，而不是只在“通用 `PropertyPanel`”和“裸 JSX”之间二选一：

```text
领域面板组件（owning package）
  CutTransformSection / CanvasInspector / AssetMetadataSection
  - 使用领域类型
  - typed callbacks，例如 onPositionChange(axis, value)
  - 不生成 PropertyDefinition，不解析 string id

组合原语（@neko/ui）
  PanelSection / PropertyRow / AxisGroup
  NumberPropertyRow / SliderPropertyRow / ColorPropertyRow / SelectPropertyRow
  - 无领域语义
  - 只负责布局、label、密度、keyframe/reset 槽位、控件组合

基础控件（@neko/ui）
  NumberInput / NumberSlider / ColorPicker / Select / Checkbox / Switch / Stepper
  - 单一控件行为
  - 不拥有 property schema 或领域状态
```

`@neko/ui` 现有 `PropertyRow` / `PropertyGroup` 仍绑定 `PropertyDefinition`，属于 schema-bound row，不足以直接服务固定领域面板。后续应提取 layout-only 的组合原语，再让 schema-bound `PropertyPanel` 复用同一套组合原语实现。

## 不共享内容

以下能力默认留在 owning package：

| 领域能力 | 保留原因 |
| -------- | -------- |
| Cut 属性、keyframe 业务语义、preview/commit、project defaults、duration/trim 转换 | Timeline 编辑语义；keyframe 视觉控件可共享，但 `AnimatableProperty`、轨道生命周期、trim 偏移和 commit 语义留在领域内 |
| Canvas 节点库、创建策略、连接属性、叙事节点面板 | Canvas 创作模型 |
| Agent Chat input、模型选择、session mode、media model bar | Agent-first 工作流 |
| Assets metadata、Entity Browser 与 Inspector action | 素材和实体生命周期 |

这些面板可以复用共享控件和样式，但不应为了复用而把领域状态先转换成通用 property schema，再从 string id 反向解析回领域 patch。

## 通用属性模型的适用场景

通用 `PropertyPanel` / property schema 只适合以下场景：

- Engine、插件、provider 或外部 manifest 在运行时返回未知字段列表。
- provider、shader、effect、filter 等参数数量和名称本身是动态数据。
- 同一通用 inspector 需要渲染多个无固定 UI 的扩展对象。
- 需要把 schema 作为跨进程、跨语言或插件 contract 传递。

即使使用通用属性模型，也应满足：

- schema 是 canonical contract，不是领域 UI 的临时中间格式。
- commit 路径有 typed command 或明确 patch contract，不依赖无约束 string id 的重复解析。
- 非法 id、未知 kind、schema mismatch 应 fail-visible，不用空 patch、no-op 或静默默认值伪装成功。
- adapter 只能存在于真实边界或动态 schema 边界，不为固定面板新增长期中转层。

## 禁止的复用方式

- 为固定领域面板新增 package-local `sharedXUiAdapter`，只为了喂给通用 UI 组件。
- 在每个领域包重复实现 `mapDomainToProperties()`、`mapPropertyCommit()`、`createDomainPatch()`、`mapDomainToTreeViewItems()`，却没有共享 schema helper 或真实动态 contract。
- 使用 `id.split('.')`、`typeof value`、`return {}`、`return null` 作为内部正常回写路径。
- 把 UI 展示默认值、clamp、领域不变量和 command 组装塞进通用 UI adapter。
- 让 `@neko/ui` 了解 Canvas/Cut/Agent/Assets 的业务类型、命令或文件格式。
- 为追求表面复用，把清晰的领域组件拆成“通用模型 + 领域解释器 + 领域反解释器”三段。

## 推荐实现方式

固定领域面板：

```text
Domain state/store
  -> domain panel component
  -> @neko/ui primitives / rows / sections
  -> typed domain callback or command
```

动态属性面板：

```text
Engine/plugin/provider schema
  -> canonical property schema
  -> generic PropertyPanel
  -> typed schema commit command
  -> domain/engine boundary
```

若多个领域都需要相同的视觉排版，应提取低语义 UI primitive 或 layout helper，而不是提取领域数据 adapter。例如优先提取 `PanelSection`、`AxisGroup`、`LayerTreeShell`、`ParameterSliderList`，而不是提取 `mapDomainTransformToProperties()` 这类领域映射。

### PropertyPanel 的新定位

`PropertyPanel` 保留，但定位收窄为：

1. 动态 schema 容器：接收 `PropertyDefinition[]`，渲染运行时未知或半动态参数。
2. 组合原语参考实现：内部应使用 `PanelSection`、`PropertyRow`、`NumberPropertyRow`、`ColorPropertyRow` 等组合原语，而不是成为独立的 monolithic renderer。

固定面板不应为了复用 `PropertyPanel` 而生成临时 `PropertyDefinition[]`。固定面板应直接使用组合原语：

```tsx
<PanelSection title={t('transform')}>
  <AxisGroup label={t('position')}>
    <AxisGroup.Axis
      axis="X"
      value={transform.x.baseValue}
      keyframeable
      hasKeyframes={transform.x.keyframes.length > 0}
      onCommit={(value) => commitTransform('x', value)}
      onToggleKeyframe={() => toggleTransformKeyframe('x')}
    />
    <AxisGroup.Axis
      axis="Y"
      value={transform.y.baseValue}
      keyframeable
      hasKeyframes={transform.y.keyframes.length > 0}
      onCommit={(value) => commitTransform('y', value)}
      onToggleKeyframe={() => toggleTransformKeyframe('y')}
    />
  </AxisGroup>
  <SliderPropertyRow
    label={t('opacity')}
    value={transform.opacity.baseValue}
    min={0}
    max={1}
    step={0.01}
    onCommit={(value) => commitTransform('opacity', value)}
  />
</PanelSection>
```

组合原语必须透传预览与提交两个阶段，而不是只暴露最终提交。`NumberInput`、`NumberSlider`、`ColorPicker` 等基础控件已经区分 `onPreviewChange` 和 `onCommit`；`AxisGroup.Axis`、`SliderPropertyRow`、`NumberPropertyRow`、`ColorPropertyRow` 等组合件也必须保持这个契约，以支持拖拽实时预览、放手提交、撤销合并和 Engine/Webview 节流。

这样固定面板和动态面板共享视觉与交互原语，但不共享数据模型。

### 领域适用矩阵

| 领域面板 | 推荐路径 | 原因 |
| -------- | -------- | ---- |
| `neko-cut` Transform / Audio / Text | 组合原语 | 固定属性集；已删除旧 `sharedPropertyAdapter`，正常编辑路径走 typed callbacks |
| `neko-canvas` Transform | 组合原语 | 固定属性较少，`AxisGroup` / row 即可表达 |
| `neko-agent` provider/model selector | 领域组件 + 公共基础控件 | session/provider 语义留在 Agent，Select/Dialog 等视觉原语复用 |
| `neko-assets` metadata/Entity Inspector | 领域组件 + 公共 layout primitive | Asset/Entity action 与事实边界由 Assets/Entity contract 拥有 |

### 当前 @neko/ui 领域泄漏

ADR 不只约束未来代码，也承认当前共享层已经存在少量领域语义泄漏。清理这些泄漏是 `@neko/ui` 继续作为无业务 UI 层的前置条件。

| 位置 | 当前泄漏 | 处理方向 |
| ---- | -------- | -------- |
| `@neko/ui/primitives/context-menu-ai.ts` | `AICapability`、`agentActions`、默认文案 `发送到 Agent` 和 Agent 图标进入共享 primitives | 删除默认 Agent 文案和图标；若保留 helper，只作为无业务 menu section builder，label/icon/action 全由消费者传入；Agent 专属 helper 移至 `neko-agent` 或 owning package |
| `@neko/ui/viewport/prediction-layer.ts` | 历史版本曾内置多个已移除领域动作 | 已改为通用基础 kind + branded/custom string；领域映射只能留在 owning package |
| `@neko/ui/creative/keyframe-timeline.tsx` | 视觉组件曾直接消费领域轨道 DTO | 保留 keyframe visual shell；使用 UI-local 最小视觉 DTO，由保留 owning package 单向投影 |

上述三项已在 `introduce-ui-composition-primitives` 变更中完成：Agent 菜单默认值改为无业务 `buildMenuSection`，prediction kind 改为可扩展 custom contract，keyframe timeline 改用 UI-local DTO。

其中 keyframe 是合理共享和领域泄漏同时存在的例子：diamond、ruler、track row、drag affordance、selection 和 context menu 视觉行为可以在 `@neko/ui/creative`；但 keyframe 的数据模型、轨道生命周期、插值语义、时间偏移和 commit path 必须留在 owning package。

Cut 的 keyframe timeline 是当前迁移锚点：领域包从 store 投影出 UI timeline 数据，shared component 只负责视觉和交互，再通过 typed callback 回到领域命令/postMessage。后续演进 keyframe visual DTO 时应保持这种单向投影结构；若仍需要 `trackProperty` 之类字符串标识，应优先演进为显式 track id / metadata，而不是让 shared component 理解领域轨道语义。

### 近期迁移优先级

固定领域面板的 P0 迁移应分三项推进：

1. 持续优先使用 `@neko/ui` 已提供的低语义 primitive 和组合件，包括 `Checkbox`、`Switch`、`Stepper`、`PropertyRow`（layout-only）、`PanelSection`、`AxisGroup`、`NumberPropertyRow`、`SliderPropertyRow`、`ColorPropertyRow`、`SelectPropertyRow`。
2. 防止 `neko-cut`、`neko-canvas` 等固定面板重新引入 package-local schema adapter；新增固定字段应直接表达领域 patch/command。
3. 保持 schema-bound `PropertyPanel` 的动态定位：内部复用组合原语，但只服务 runtime/provider/registry 等真实动态字段。

并行的 `@neko/ui` 边界清理应优先处理上表三处领域泄漏。否则新组合原语会建立在不干净的共享层上，后续领域包仍会继续把业务语义推入 `@neko/ui`。

这三项必须成组推进。只补 primitive 但继续保留领域对象到通用 property schema 的往返转换，无法减少路径复杂度；只删除 adapter 但不补低语义组合件，又会诱发新的 package-local 控件复制；只重构 `PropertyPanel` 内部但不迁移固定面板，则无法消除固定领域的类型擦除路径。

## 组件复用审查规则

新增或重构 Webview 面板时，review 必须回答：

1. 当前面板是固定领域功能，还是运行时动态 schema？
2. 是否已审计 `@neko/ui/creative`、`@neko/ui/primitives`、`@neko/ui/workbench` 和 owning package 现有组件？
3. 共享的是样式/控件/约束，还是领域功能模型？
4. 是否新增了领域对象到通用 UI 模型再反向解析的中转层？
5. 代码量是否实际下降，还是把代码移动到了 adapter 和 adapter tests？
6. 非法状态是否 fail-visible，而不是空 patch、no-op guard 或静默默认值？

若答案显示只是固定领域面板，应保留领域组件结构，只复用 `@neko/ui` 原语和样式约束。

## 后果

正向影响：

- 领域 UI 更直接表达创作工作流，减少无意义的转换层。
- `@neko/ui` 保持无业务、低耦合、可跨包复用。
- 固定面板重构不再因为适配通用 schema 而增加代码量。
- 动态参数面板仍有明确共享路径，适合 Engine、插件、shader、effect 和 provider 参数。

代价：

- 不同领域的面板组件会保留不同结构，不能追求表面统一。
- 共享层需要补更多低语义 primitive，而不是一个“大而全”的 property interpreter。
- 一些已有 adapter 需要在后续重构中逐步内联、删除或改造成真正的 dynamic schema helper。

## 与其他文档的关系

- UI、主题、i18n、错误和日志横切边界见 [`ui-theme-i18n-error-logging.md`](ui-theme-i18n-error-logging.md)。
- 子包运行平面和 `@neko/ui` 依赖边界见 [`package-boundaries.md`](package-boundaries.md)。
- 重复、冗余和兼容路径治理见 [`adr-code-debt-redundancy-governance.md`](adr-code-debt-redundancy-governance.md)。
- 质量门禁和组件复用审计见 [`adr-code-review-quality-gates.md`](adr-code-review-quality-gates.md)。
