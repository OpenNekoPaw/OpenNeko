## Context

Character Management 与 World Management 分别是 `@neko/chara-webview` 和 `@neko/world-webview` 拥有的单例管理 scene。两者都展示全局 durable 记录和不可变领域版本，但条目内容、诊断、选择和详情 owner 不同。Project Management 的分组层级可以作为 presentation 参考，不能成为跨领域 Root 或模板 authority。

五层分析：

- 职责：各 Webview package 继续决定自己的目录内容、选择和导入操作；Desktop 只组合当前 Development scene。
- 依赖：改动只使用既有 React state、`@neko/ui` 图标和 package CSS，不接触 Electron、Node 或文件路径。
- 接口：现有 `onImport`、`onSelect`、`reload` 和 catalog projection 不变；每个 catalog 增加必需的 `onCreate` 与 `onStartFromTemplate` presentation callback，Desktop 将二者精确组合到既有 `open-agent-entry` transition。
- 扩展：内置快速起点由 Character/World package 分别定义；未来出现 durable template owner 时由对应领域替换其静态 projection，不需要通用 Template registry。
- 测试：组件测试覆盖信息层级、计数、模板 identity 与 callback；style contract 与可见 Desktop 验收覆盖宽屏和窄宽布局。

## Goals / Non-Goals

**Goals:**

- 让角色、世界和项目管理具有一致的浏览节奏与集合控制布局。
- 让“我的角色”和“我的世界”成为明确分组，并限制低频搜索框宽度。
- 保留角色与世界卡片的领域差异及 fail-local 诊断。
- 提供明确区分的角色模板和世界模板快速起点，并复用现有开始创作导航。

**Non-Goals:**

- 不合并 Character、World 或 Project Root、状态、catalog 或 durable identity。
- 不新增模板 durable entity、模板管理 catalog、模板编辑器、隐藏 Prompt 注入或跨领域 Template registry。
- 不改变导入、authoring、runtime、详情、版本或发布语义。
- 不改变 Release 隐藏角色与世界入口的策略。

## Decisions

### 1. 复用页面层级，不复用领域 Root

两个 catalog 都使用一个 package-owned 滚动容器，内部依次呈现领域 hero 和“我的内容”集合。Hero 提供标题、说明、显式新增与真实导入动作以及领域自有 CSS 图形；集合 header 放置名称、结果数量、紧凑搜索、排序和刷新。

不抽取跨 package React 组件。共同点是稳定且很小的 presentation 参数，而查询、projection、invalid record 和选择语义不同；强制组件复用会扩大 owner 边界。

### 2. 搜索和卡片响应式跟随 Project 的可读宽度原则

搜索框限制在 `220px` 到 `288px`，与排序和刷新组成集合 controls；窄容器下 controls 换行，搜索占完整行。Character 继续使用 214px 身份卡，World 继续使用 280px 信息卡；不足正常卡宽时单列收缩，不把稀疏卡片拉成面板。

### 3. 内置模板是领域快速起点，不是第二套 durable catalog

Project template、Character template 和 World template 是不同领域的内置创建预设，不是一个通用 durable record。Character 页面提供 `character-kit`，World 页面提供 `world-bible`，各自由 owning Webview package 定义标题、说明、图形和稳定的 presentation identity。卡片只有在 Desktop 提供必需 callback 时才能组成；点击后调用既有 `open-agent-entry` transition，与 Project 当前快速起点保持同一成功语义。

本变更不把 template identity 写入 Project、Conversation、Agent draft 或 prompt，也不宣称已创建角色或世界。未来若模板需要预填 authoring facts 或拥有创建、编辑、发布生命周期，必须由对应领域新增明确 public contract 并原子替换当前通用开始创作 callback。

### 4. 视觉变化不得改写 canonical 行为

导入按钮仍调用同一 `onImport`；搜索、排序和刷新仍命中既有 runtime；条目仍以精确 identity 调用 `onSelect`；非法记录继续作为 sibling card 可见。不存在 feature flag、旧布局 fallback 或隐藏 Root。

模板卡只调用必需的 `onStartFromTemplate`；Desktop consumer 使用唯一 `open-agent-entry` transition，不创建第二个 Scene handler 或保留模板选择状态。

### 5. 新增与导入是两个不同操作

Character 与 World hero 各自显示一个主“新增”按钮和一个次级“导入包”按钮。新增按钮调用 package public surface 的必需 `onCreate` callback，Desktop 将其组合到既有 `open-agent-entry` scene；它不直接写入 global catalog，也不以空白定义伪造不可变首版。导入按钮继续调用既有 `onImport`，经过原生文件选择、portable package 校验和领域 catalog commit。

两个按钮不得复用同一文案、同一 callback 或隐式根据环境切换语义；空目录提示同时提供新增与导入选择。

## Risks / Trade-offs

- Hero 会增加首屏垂直占用；通过与 Project 相同的 184px 节奏和窄屏收缩控制，不挤压集合可达性。
- 当前模板只表示进入开始创作的领域快速起点；它不会预填 Agent 内容。文案和测试必须避免把该动作表述为已经创建领域记录。
- 两个 package 会出现少量相似 CSS；这保持领域 ownership，focused style contract 用于防止关键尺寸漂移。

## Migration Plan

1. 先更新组件测试，固定 hero、我的内容集合、模板 identity 和必需 callback。
2. 原子调整 Character 与 World catalog DOM、CSS 和 Desktop composition。
3. 运行 package tests/typechecks、Desktop focused tests、OpenSpec 和 diff checks。
4. 通过开发模式真实 Electron 检查宽屏、窄宽、模板卡和 populated state。

回滚只恢复 package-owned presentation，不涉及用户数据或 contract。

## Open Questions

无。
