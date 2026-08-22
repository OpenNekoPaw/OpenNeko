## Why

Canvas 视频节点把预览、文件定位、两个媒体库复制和节点复制同时铺在浮动工具栏中，却没有提供真正面向剪辑流程的素材 handoff。现有“在剪辑中打开”实际只接受 `.otio` 文档，名称与视频用户意图混淆，固定显示前五个动作也让不同职责的命令看起来重复。

## What Changes

- 将现有 `.otio` handoff 明确命名为“打开剪辑”，继续只打开或聚焦 exact Cut 文档。
- 增加 Cut-owned“添加到剪辑”素材动作，只对支持的单个视频或音频素材投影，并携带 exact Workspace、Canvas material 与 Cut target identity；没有现有目标时由明确的新建剪辑语义创建目标，不回退 active/recent Cut。
- 把 Canvas 节点浮动工具栏从固定“前五项”改为按用户意图分级：剪辑/生成等创作命令优先，节点内播放留在节点，独立预览和文件/媒体库/节点管理进入更多操作。
- 将“复制”重命名为“创建节点副本”，避免与复制文件到项目/全局媒体库混淆；两个媒体库目的地在更多操作中归为同一媒体库分组。
- 保持动作 resolution、execution、Cut revision 校验、Workspace 路径授权与失败隔离为单一 canonical producer/consumer 链，不增加 renderer 文件 IO 或 Desktop-owned Cut 业务状态机。

## Capabilities

### New Capabilities

- `canvas-video-action-workflow`: 定义 Canvas 视频/音频节点动作分级、OTIO 打开与素材添加到 exact Cut target 的不同语义、媒体库操作分组和用户可见失败行为。

### Modified Capabilities

<!-- None. The new capability composes the existing stable Canvas material-action and Cut target contracts. -->

## Impact

- `packages/canvas/domain`：拥有 canonical material-action descriptor/intent 和 Canvas 侧动作目录规则，不拥有 Cut 文档或目标选择事实。
- `packages/canvas/webview`：拥有节点浮动工具栏的展示优先级、分组、标签和交互测试，不访问 Node/Electron。
- `packages/cut/domain` / `packages/cut/node`：拥有素材 handoff 的目标、revision 校验、必要的新草稿创建与一次 OTIO command 提交。
- `apps/neko-desktop`：只解析 sender-bound Workspace/Workbench identity、注入 Cut public port、授权 ContentLocator 并投影结果；不新增 app-owned 时间线策略或 active-editor fallback。
- 用户文件：不覆盖源媒体；添加到剪辑只修改 exact Cut session，保存仍由现有 Cut authority 处理。
