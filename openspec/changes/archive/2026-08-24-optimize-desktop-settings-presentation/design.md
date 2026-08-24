## Context

Settings 当前被组合成 Host-owned Scene。修正后，它是当前 Window Shell 上方的短生命周期 overlay：背景 Scene、业务 Root 与精确 identity 保持不变；overlay 内根据 section 消费同一个 application settings projection。主题、语言与资源视图更新仍通过 `@neko/host/application-settings` 的唯一 public path 完成。

五层分析：

- 职责：Desktop Renderer 负责 Window overlay 的打开、分组选择、焦点和关闭；Host settings owner 负责 preference 事实与更新；Desktop Scene service 不再拥有 Settings 导航。
- 依赖：overlay 只依赖 settings context、i18n 和 `@neko/ui` Dialog，不访问 Electron、文件或持久化。
- 接口：保留 `DesktopApplicationPreferences`、`settings.update` 与 `openAgentAdvanced`；删除 Scene contract 中的 Settings context/ref/intent，不增加替代 DTO。
- 扩展：section 是 overlay-local presentation state；Dialog 关闭后直接释放，不建立 Settings session 或隐藏 section Root。
- 测试：Host contract/service 覆盖旧路径移除；Renderer 覆盖打开、切换、关闭、背景 Scene 不变、响应式与真实 Electron pixels。

Agent Provider 目录的五层分析：

- 职责：AI contracts 拥有 Provider 支持的模型族事实；Host settings service 投影并校验该事实；Renderer 只渲染对话/生成两个目录和短时编辑状态。
- 依赖：分类不依赖 Renderer 文案、卡片位置或加载顺序；凭据仍只经 Host credential authority，Renderer 不读取密钥。
- 接口：`ProviderConfig.supportedModelFamilies` 是唯一持久分类；Desktop typed request/view 原样传递；模型仍由既有 `ModelType` contract 表达。
- 扩展：一个 Provider 可以显式支持一个或两个模型族，并出现在对应目录；新增按钮创建时只声明所在目录的模型族。
- 测试：覆盖双目录、独立新增、无待配置分组、刷新后分类稳定、模型族校验、所有 config-backed Provider 的删除入口、关联模型保护与凭据删除回滚。

## Goals / Non-Goals

**Goals:**

- 从任何当前 Scene 打开 Settings overlay，关闭后原 Scene identity 与 presentation 保持不变。
- 使用共享 Dialog 提供遮罩、焦点约束、Escape 与关闭按钮。
- 建立不含额外顶部标题区的紧凑导航、组、卡片和控件层级，同时保留 Dialog 无障碍命名。
- 保持设置更新的 Host authority 与 fail-visible 错误语义不变。

**Non-Goals:**

- 不增加新设置项、搜索索引或偏好字段。
- 不持久化 overlay 分组、尺寸或位置。
- 不复制背景业务 Root 或把 Settings 建模为 durable record/session。

## Decisions

### 1. Settings 是 Renderer-owned Window overlay

`DesktopSceneWorkbench` 保存 `{ section } | undefined` 的可丢弃状态。应用侧栏按钮只打开 overlay，不发送 Scene intent。关闭、Escape 与 backdrop dismiss 释放 overlay；当前 Scene composition 不变。

### 2. 复用共享 Dialog primitive

`@neko/ui` Dialog 已拥有 Portal、overlay、modal focus boundary、Escape、close 和 focus restore。Desktop 只提供 Settings 专属尺寸和双栏内容，不复制一套 modal infrastructure。

### 3. 原子删除旧 Settings Scene 路径

Desktop Scene context、surface refs、intent、service composition、producer/consumer fixtures 与测试一次性删除。不得保留“有时 Scene、有时 overlay”的成功语义。

### 4. overlay 不显示额外的 Settings header

共享 Dialog 的 title/description 继续作为 modal 的无障碍名称与说明，但 Settings 专属 CSS 将其 header 包装为 visually-hidden 语义内容，不占据视觉布局。Main surface 在 overlay 模式也不重复页面标题；可见内容直接从导航和当前分组标题开始。宽 overlay 使用导航+内容双栏，窄 overlay 让导航与设置行收敛，关闭按钮独立固定在 overlay 右上角。

### 5. 错误继续 fail-visible 且局部化

现有 pending/diagnostic 状态保留：失败只在 overlay 内容显示，不伪造成功、不清空其他设置，也不影响背景 Scene。

### 6. Settings 尺寸必须覆盖共享 Dialog 的紧凑默认值

共享 `Dialog` 的通用内容宽度是 520px，适合确认类弹窗，不适合 Settings 双栏工作区。Settings 使用更具体的 dialog selector 明确覆盖该默认值。overlay 不采用固定 `1040×680px` 画布，而是从当前 Window 的短边计算 `16–40px` 动态安全边距，在此边距内同时占满可用宽高；超大 Window 再由 `1440×960px` 桌面级上限约束，避免设置内容被无意义拉得过宽或过高。导航与内容列分别拥有内部滚动，弹层本身不依赖外层页面滚动。

### 7. Provider 目录以模型族为第一层，不再使用总容器

Agent section 直接渲染“对话 Provider”和“生成 Provider”两个 sibling 目录；每个目录的标题行同时承载数量与新增按钮。不存在外层 Provider 标题、统一新增按钮、mixed 目录或 unconfigured 目录。支持两个模型族的 Provider 可以在两个目录分别作为同一 Provider 的只读投影出现，但编辑和删除始终命中同一个精确 Provider identity。

`ProviderConfig.supportedModelFamilies` 保存用户在新增时选择的目录归属。字段缺省不是旧配置成功路径：Host 从该 Provider 当前 authoritative models 推导投影；没有模型时只使用 provider protocol 的稳定能力语义（Ollama 及通用对话协议属于 dialogue），不制造“待配置”记录。Renderer 不缓存或写回推断结果。

Provider 删除复用唯一 `delete-provider` application operation。所有 Provider 都来自 canonical `~/.neko/config.toml`，Renderer 和 Host 不得用 `builtin` 元数据建立不可删除的平行目录；仍拥有模型的 Provider 拒绝删除并显示局部 diagnostic；配置删除后凭据清理失败时恢复同一 Provider 配置并返回明确错误。没有 Renderer 直写 config、级联删除或静默凭据残留路径。

## Risks / Trade-offs

- [删除 Settings Scene 影响恢复 fixture] → 原子更新 contract/service/Renderer 与测试；Settings 本身没有 durable Scene identity 需求。
- [共享 Dialog 的 520px 默认宽度把双栏压成狭长面板] → 使用更具体的 Settings dialog selector、动态 Window 安全边距和桌面级最大尺寸，同时保留明显 backdrop 与圆角边界。
- [窄窗口双栏拥挤] → 依据 overlay content container 切换为单列。
- [双能力 Provider 在两个目录重复出现] → 两处只投影同一 identity，不复制配置；编辑或删除后的 Host projection 原子刷新两个目录。
- [已有 Provider 未声明模型族] → 只从当前 models/protocol 计算投影，不创建第三个兜底目录；下一次用户显式编辑可写入 canonical 声明。

## Migration Plan

1. 删除 Desktop Scene contract/service 的 Settings context、surface refs 和 intent。
2. 使用共享 Dialog 组合 Renderer-owned Settings overlay。
3. 更新 Host/Renderer focused tests，运行 typecheck、OpenSpec 和 diff 检查。
4. 在真实 Electron 中验证从当前 Scene 打开、切换分组、关闭后背景 Scene 保持不变。

回滚需要同时恢复唯一 Host Scene 路径；没有用户偏好迁移。

## Open Questions

无。
