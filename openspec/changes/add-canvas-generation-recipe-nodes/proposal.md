## Why

Canvas 当前的添加菜单直接创建 Markdown/Media/File 内容节点，而现有 Generation 投影又把一次执行展开为独立 Job 节点和结果节点；这与目标创作流程“添加生成节点、配置提示词/参考/模型/参数、生成结果回填原节点”不一致。Agent composer 同时保留直接图片/视频/音频模式，进一步复制了 Canvas 应拥有的参数化生成入口和 UI 状态。

## What Changes

- **BREAKING** Canvas 添加入口只保留 Text、Image、Audio、Video，并原子切换为一种 canonical Generation Node 的不同 `kind`；Table 与 3D Director 不再作为本次 Canvas 基础节点目录入口，历史 Markdown/File 内容保持可读。
- `@neko/generation` 统一拥有严格 typed Recipe、默认值、校验和 Job request 投影；Generation Node 在 `.nkc` 中嵌入该 canonical Recipe，并持久保存 Canvas 自己拥有的稳定图关系、运行关联和可选择输出引用。Job、provider task、生成文件与资产版本仍由 `@neko/generation`/内容资产 owner 持有。
- 选中 Generation Node 后由 Canvas package-owned 编辑器提供提示词、参考信息、purpose-qualified 模型和类型专用参数；显式运行创建一个不可变 GenerationJob request，成功结果回填原节点而不创建默认 Job/Media sibling 节点。
- Canvas Host 从当前 Workspace Neko 配置投影无密钥、purpose-qualified 的可用生成模型目录；composer 以模型选择器和 typed 参数面板替代 provider/model/比例/分辨率等自由文本输入，只采用显式用途/类型默认绑定，不从列表顺序推断 provider 或模型。
- Audio Generation Node 在同一 canonical Recipe/Job 路径内明确区分“音频生成”和“音乐生成”模式；模式切换改变所需 purpose、可选模型和参数表面，但不新增第五种节点、第二套提交协议或 fallback。
- Canvas 选中态拆分为悬浮操作栏、内容节点和独立生成输入 composer：普通/引用节点只显示带节点类型和直接操作的工具栏与内容节点，Generation Node 额外显示跟随精确选中节点的紧凑 composer；三者形成固定附件栈，操作栏始终位于节点上方、composer 始终位于节点下方，空间不足时平移 Canvas 视口容纳整组而不独立夹取或翻转附件。Generation Node 按 Text/Image/Audio/Video 对应内容节点样式渲染并使用白色或轻玻璃不透明度的中性节点表面、统一细边框和克制阴影，空态与结果态不显示“生成节点”任务卡标题。composer、操作栏和弹层使用同一白色玻璃 surface 家族，按钮默认不叠加独立背景，仅在 hover/selected/focus 时显示轻量状态；composer 不重复节点标题/状态、不复用 Canvas 灰色背景，也不再以独立灰色 footer 或饱和危险色块制造第四套背景，是可重建 presentation，不是第二个 Canvas 节点或事实来源。
- composer 的 `+` 通过 Canvas Host 授权选择 Workspace 参考素材并以同一串行命令原子创建素材节点和指向精确 Generation Node 的 `reference` 连接；Renderer 不读取本地路径。模型选择项将模型和 provider 在同一行展示，typed 参数弹层继承 composer 宽度上下文并限制在 Canvas 可视边界内，以分组网格和内部滚动呈现，禁止收缩为跨越画布的单列长条。
- Canvas Domain 统一拥有新建节点的紧凑默认尺寸和最小缩放尺寸；Webview、Headless authoring、Generation authoring 与 Workspace Board 投影复用同一密度契约。新建文本、媒体、生成与投影节点减少画布占用，图片仍保持原始宽高比；已有 `.nkc` 节点的用户尺寸不因默认值变化而被改写。
- Canvas 素材节点操作栏按 Text/Image/Video/Audio 使用固定、可预测的 action 槽位和顺序。运行时 capability 暂时消失时保留原槽位并禁用，避免按钮重排；从未由该类型声明的操作不进入工具栏。保存素材、Finder、复制到项目或全局媒体库等资源管理操作只在资源管理界面提供，不得出现在 Canvas 主操作或更多菜单。更多菜单保持单层短列表，节点右键菜单只保留最小图布局操作；删除不在工具栏、更多菜单、右键菜单或提示文案中出现，只由 Canvas 焦点边界内的 Delete/Backspace 快捷键处理。
- 工作区资源浏览器的 `ContentLocator` 可直接拖入 composer 参考区，保留 Workspace 引用而不复制；其他目录素材必须通过显式“导入到工作区”操作获得 durable locator 后再连接，不得将绝对路径作为参考事实。
- 新 Generation Node 从精确 Workspace ConfigManager 的 purpose-qualified 默认绑定初始化模型，并按 kind 写入 canonical typed 默认参数；只有默认绑定缺失或已失效时才要求用户选择，不允许当前选择器推测 provider 或回退到列表首项。
- Image composer 收敛为参考图一致的紧凑编辑卡：参考区位于左上，提示词区域吸收剩余高度，模型、比例/分辨率/画质摘要、独立生成数量和运行操作固定在单行底栏。图片参数弹层使用五列比例卡片和 1K/2K/4K、低/中/高分组；生成数量从综合参数中拆为窄型纵向弹层，但仍写回同一 typed Recipe `count` 字段。
- Webview 发起的文档替换、删除后续状态提交与 Host-owned 节点创建必须经过同一串行命令队列；后续新增不得基于陈旧 Host snapshot 恢复已删除节点或连接。
- 每次运行创建新的 Job 与输出；同一 Job 的多个图片输出在原节点内以双列紧凑网格并排展示，用户直接点击任一图片更新当前输出选择，不再依赖折叠堆叠或输入面板顺序切换。节点仍保留历史输出引用，失败保留上次成功结果并显示局部 diagnostic。第一阶段每节点只允许一个 active Job，且不因上游变化自动执行下游节点。
- 连接线只表达节点关系和顺序，使用统一中性线条与单一顺序方向提示，不承载复杂执行状态或媒体类型视觉编码。每个节点视觉上最多暴露一个输入端口和一个输出端口；内部 typed compatibility 仍由 Canvas Domain 校验。节点创建、拖动和自动定位复用网格对齐与避让规则，避免端口、节点和附件栈冲突。输入在运行时由 Canvas owner 解析为稳定文本或授权 `ContentLocator`，输出只暴露节点当前选择的结果；缺失、类型不匹配、过期或未授权输入仅阻塞当前运行。
- 画布缩放明确区分世界空间和屏幕空间：节点与连接随画布缩放，工具栏、composer、菜单和预览控件保持可用的屏幕尺寸；极端缩放采用分级细节和最小点击目标，不改变 durable 节点尺寸或选择事实。
- 预览统一为三类且不重复入口：节点内容内快速预览；双击节点进入 Canvas 全屏预览；工具栏只提供由 Preview owner 执行的主面板预览按钮。三者复用同一授权 locator 和 Preview 渲染能力，但 Canvas 全屏层只拥有覆盖层、画廊索引、关闭和输入隔离，不复制 Preview 的缩放、播放或媒体解码 owner。
- 扩展 `@neko/generation` 的 canonical Job request/result，使显式 Prompt/Text 生成与图片、音频、视频共享 Workspace Job owner、持久恢复、取消、重试和结果提交，但普通 Agent 回复仍只属于 Agent Turn transcript。
- **BREAKING** Agent composer 不再展示或提交独立 Image/Video/Audio direct modes；自然语言媒体生成继续通过 Agent Turn 的 typed Generation Tool 调用同一 Workspace Job owner。Canvas 通过 package-owned Canvas Generation application port 调用唯一 GenerationJob port，不保留第二个等价 direct submit contract 或隐藏的 Agent Webview 成功路径。
- Agent 无明确 Canvas 目标的 creator-visible 产物继续投递到 Workspace Board；Canvas Generation Node 的结果只写回其精确 `.nkc` 文档和节点，不镜像到 Workspace Board。
- 不预定义 World、3D 或其他未来模型 kind；真实能力出现后通过 capability/Tool catalog 与 Generation discriminated union 的独立 OpenSpec 扩展。

## Capabilities

### New Capabilities

- `canvas-generation-nodes`: Generation Node 的 Recipe、输入、运行、输出选择、原节点回填、连接和局部失败生命周期。

### Modified Capabilities

- `desktop-assets-canvas-integration`: Canvas add-node catalog 的 Text/Image/Audio/Video 入口从直接内容/媒体创建切换为 package-owned Generation Node authoring。
- `generation-domain-package`: direct generation consumer 从 Agent composer 收敛到 Canvas Generation Node，并增加 Prompt/Text Job request/result，同时保持 Agent Tool 与 Canvas 共用一个 Workspace owner。
- `agent-configuration-policy`: Agent composer 停止暴露独立媒体模式，purpose-qualified 生成模型只作为 Agent Tool/Generation 执行绑定使用。

## Impact

- `@neko/canvas-domain` owns the Generation Node wrapper, graph references, `.nkc` codec, run/output binding and Canvas authoring state machine; `@neko/canvas-node` owns host-neutral Job submission/observation and exact-node result apply; `@neko/canvas-webview` owns the add menu, node renderer/editor, controls and recoverable presentation.
- `@neko/generation` owns the one canonical Prompt/Text/Image/Audio/Video Recipe union, defaults, validation, request projection, Job request/result union, execution ports, persistent Job lifecycle and artifact commit. It does not import Canvas, Agent, React or Electron.
- `@neko/agent-contracts`, `@neko/agent-runtime` and `@neko/agent-webview` remove Agent direct-mode UI/contracts/wiring while retaining natural-language Turn, purpose model facts and typed media Tool delegation.
- `apps/neko-desktop` remains the thin Electron composition/trust boundary: it injects exact Workspace configuration, Generation and Canvas public ports, sender-bound IPC and authorized resource projections. No recipe, routing, result-selection or recovery policy remains app-owned.
- Existing imported Media/Markdown/File nodes and historical Canvas Job nodes remain readable user content, but new Generation runs no longer create Job/Media sibling graphs and historical generated Media actions cannot remain a second regenerate success path.
- Verification affects Canvas domain/codec/Webview tests, Generation Job and persistence tests, Agent contract/runtime/Webview tests, Desktop bridge and restart recovery, visible Electron UI validation and focused Agent Evaluation for the retained natural-language Tool path and removed direct-mode fallback.
