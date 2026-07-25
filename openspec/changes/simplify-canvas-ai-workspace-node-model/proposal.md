## Why

Canvas 当前暴露 33 种核心和子系统节点，并让 Storyboard、Narrative、Behavior、Entity、Memory 等领域语义直接进入 `.nkc`、Webview renderer、Agent authoring、播放计划和 Extension bridge。AI 驱动的创作工作流实际主要交付 Markdown、媒体、文件引用、分组和 Job 结果；继续保留大量手工领域节点会制造重复 authoring path、占位能力和不可维护的预览分支。

## What Changes

- **BREAKING**：Canvas canonical node model 收敛为 `markdown`、`media`、`group`、`job`、`file` 和 `canvas-embed`。
- 图片、音频和视频是同一 `media` 节点的显式创建变体，共用稳定资源身份和 renderer registry。
- `job` 节点只投影显式 Job identity、revision、状态、输入和结果引用；Job 生命周期继续由 owning Job service 持有。
- `file` 统一替代 Script、Document、Model 和 Project 等普通文件引用节点；子 Canvas 保持独立 `canvas-embed`，因为它拥有导航和嵌套画布语义。
- 删除 Storyboard、Shot、Scene、Gallery、Artboard、Narrative、Behavior、Entity 和 Memory 节点的创建、authoring、renderer 和 command 成功路径；保留独立的 Preview workspace、播放控制、route/storyboard matrix 与媒体 runtime。
- 连接类型收敛为 `sequence`、`reference` 和 `derived-from`；Group 成员关系只由 container `childIds` 表达。
- 旧 `.nkc` 在 codec/load 边界按显式版本迁移到新模型；无法无损映射的运行时领域状态返回可见 diagnostic，不通过旧 renderer 或 fallback 继续成功。
- Character 节点不在本次注册。未来 `neko-chara` 提供稳定 CharacterProject/CharacterVersion 引用与 capability contribution 后，再通过独立变更加入“引用”目录。
- 删除常驻右侧节点目录；左侧工具栏通过“添加”弹层提供“创建 / 导入 / 引用”动作，并与画布右键菜单复用同一 action catalog。
- 只有 Markdown 和 Group 可从空状态创建。Media、File、CanvasEmbed 必须绑定真实来源；Job 只由 owning Job/Agent 流程投影，不提供空 JobCard 创建入口。
- Canvas Webview 的添加动作、节点状态、无障碍标签和动态枚举必须支持英文与简体中文，并在缺失翻译时通过测试失败。
- Playback 继续由原 Preview workspace 消费新的 generic plan adapter；音视频仍通过 Extension 授权的 Engine stream 与 `@neko/neko-client` 播放，不改为 Webview 原生 `<audio>` / `<video>`。
- 节点类型收敛不得删除通用 Canvas 能力：节点变换/锁定/属性/端口编辑、连接线编辑、Markdown 编辑与渲染、媒体预览、生成来源展示和快速生成入口继续保留。
- 快速生成从显式 Canvas selection 发起，由 Agent 创建并运行 Job；Canvas 不恢复 Shot/Scene 专用 executor，也不直接调用 provider。

## Capabilities

### New Capabilities

- `canvas-ai-workspace-node-model`: 定义 AI 驱动 Canvas 的最小节点、目录、连接、迁移和预览边界。

### Modified Capabilities

- `canvas-add-source-actions`: 文件来源入口改为 Media 变体、File 和 CanvasEmbed，不再按旧具体文件节点类型分流。
- `workspace-board-artifact-delivery`: Workspace Board 只投影 Markdown、Media、File 和 provenance connection，不再产生旧视觉节点。

## Impact

- `packages/neko-types`: Canvas node/connection contract、`.nkc` validator、迁移、generic playback input adapter 和 authoring DTO。
- `packages/neko-canvas`: domain、Extension API/commands/bridges、Webview add actions/renderers/stores/preview、Workspace Board projector。
- `packages/neko-agent`: Canvas capability catalog、Job 投影和 Workspace Board delivery 的节点类型。
- 文档与测试：Canvas 架构、节点目录、旧数据迁移说明，以及共享契约/生产者/消费者/运行态验证。
