## Why

Canvas 当前的添加菜单直接创建 Markdown/Media/File 内容节点，而现有 Generation 投影又把一次执行展开为独立 Job 节点和结果节点；这与目标创作流程“添加生成节点、配置提示词/参考/模型/参数、生成结果回填原节点”不一致。Agent composer 同时保留直接图片/视频/音频模式，进一步复制了 Canvas 应拥有的参数化生成入口和 UI 状态。

## What Changes

- **BREAKING** 将 Canvas 的 Text、Image、Audio、Video 添加入口原子切换为一种 canonical Generation Node 的不同 `kind`；Table 与现有 3D Director 行为保持不变且不在本次扩展范围。
- Generation Node 在 `.nkc` 中持久保存严格 typed Recipe、稳定输入引用、运行关联和可选择的输出引用；Job、provider task、生成文件与资产版本仍由 `@neko/generation`/内容资产 owner 持有。
- 选中 Generation Node 后由 Canvas package-owned 编辑器提供提示词、参考信息、purpose-qualified 模型和类型专用参数；显式运行创建一个不可变 GenerationJob request，成功结果回填原节点而不创建默认 Job/Media sibling 节点。
- Canvas 选中态拆分为悬浮操作栏、内容节点和独立生成输入面板：普通/引用节点只显示操作栏与内容节点，Generation Node 额外显示输入面板；输入面板是可重建 presentation，不是第二个 Canvas 节点或事实来源。
- Webview 发起的文档替换、删除后续状态提交与 Host-owned 节点创建必须经过同一串行命令队列；后续新增不得基于陈旧 Host snapshot 恢复已删除节点或连接。
- 每次运行创建新的 Job 与输出；节点保留历史输出引用并选择当前输出，失败保留上次成功结果并显示局部 diagnostic。第一阶段每节点只允许一个 active Job，且不因上游变化自动执行下游节点。
- 输入连接在运行时由 Canvas owner 解析为稳定文本或授权 `ContentLocator`，输出连接只暴露节点当前选择的结果；缺失、类型不匹配、过期或未授权输入仅阻塞当前运行。
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

- `@neko/canvas-domain` owns the canonical Generation Node/Recipe contract, `.nkc` codec and authoring state machine; `@neko/canvas-node` owns host-neutral Job submission/observation and exact-node result apply; `@neko/canvas-webview` owns the add menu, node renderer/editor, controls and recoverable presentation.
- `@neko/generation` owns the extended Prompt/Text/Image/Audio/Video Job request/result union, execution ports, persistent Job lifecycle and artifact commit. It does not import Canvas, Agent, React or Electron.
- `@neko/agent-contracts`, `@neko/agent-runtime` and `@neko/agent-webview` remove Agent direct-mode UI/contracts/wiring while retaining natural-language Turn, purpose model facts and typed media Tool delegation.
- `apps/neko-desktop` remains the thin Electron composition/trust boundary: it injects exact Workspace configuration, Generation and Canvas public ports, sender-bound IPC and authorized resource projections. No recipe, routing, result-selection or recovery policy remains app-owned.
- Existing imported Media/Markdown/File nodes and historical Canvas Job nodes remain readable user content, but new Generation runs no longer create Job/Media sibling graphs and historical generated Media actions cannot remain a second regenerate success path.
- Verification affects Canvas domain/codec/Webview tests, Generation Job and persistence tests, Agent contract/runtime/Webview tests, Desktop bridge and restart recovery, visible Electron UI validation and focused Agent Evaluation for the retained natural-language Tool path and removed direct-mode fallback.
